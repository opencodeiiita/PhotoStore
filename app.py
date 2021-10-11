#!/usr/bin/env python

# for system operations, file handling
import base64
import random
import string
import time
import os
from hashlib import md5
import mimetypes
from datetime import datetime
from pathlib import Path
from io import BytesIO
from PIL import Image, UnidentifiedImageError

# for HTTP server, web application
import json
from flask import (
    Flask,
    flash,
    request,
    redirect,
    url_for,
    jsonify,
    render_template,
    make_response,
    render_template_string,
    send_from_directory,
)
from werkzeug.exceptions import RequestEntityTooLarge

# we will be using hashes
# from werkzeug.utils import secure_filename

# to prettify the rendered HTML document
from flask_pretty import Prettify

# to sanitize input
import re

# for session tokens
import jwt
from jwt.exceptions import PyJWTError, ExpiredSignatureError

# for local database
from threading import Lock
from tinydb import TinyDB, Query
import tinydb.operations

# for authentication, CAPTCHA image
import bcrypt
from captcha.image import ImageCaptcha

# SECRETs
from secret import SECRET_KEY, CAPTCHA_KEY

# some bookkeeping
CWD = Path(os.path.dirname(__file__))
UPLOAD_FOLDER = CWD / "uploads"
ALLOWED_EXTENSIONS = {"jpg", "png", "svg", "jpeg"}

# flask app
app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["SECRET_KEY"] = SECRET_KEY
app.config["CAPTCHA_KEY"] = CAPTCHA_KEY
app.config["CAPTCHA_EXPIRE_SECONDS"] = 5 * 60  # 5 minutes
app.config["MAX_CONTENT_LENGTH"] = 1 * 1000 * 1000  # 1MB limit
app.config["DATABASE"] = "photostore.db"
app.config["USE_CAPTCHA"] = False

# for CAPTCHA
captcha = ImageCaptcha()

# for local database (this table is not used)
TinyDB.default_table_name = "photostore"
dbLock = Lock()


def allowed_file(filename):
    return extension(filename).lower() in ALLOWED_EXTENSIONS


def extension(filename):
    return "" if "." not in filename else filename.rsplit(".", 1)[1]


def validUsername(username):
    return username and re.match(r"^[0-9A-Z_]{4,32}$", username, flags=re.I)


def isLoggedIn():
    token = request.cookies.get("jwt")
    jwtData = decodeFromJWT(token)
    return bool(jwtData)


def encodeToJWT(data):
    return jwt.encode(data, key=app.config["SECRET_KEY"], algorithm="HS256")


def decodeFromJWT(token):
    jwtData = {}

    try:
        jwtData = jwt.decode(token, key=app.config["SECRET_KEY"], algorithms=["HS256"])
    # except PyJWTError:
    except Exception as exc:
        pass

    return jwtData


def generateCaptcha():
    captcha_length = random.choice(range(6, 11))
    captcha_value = "".join(
        [random.choice(string.ascii_lowercase) for _ in range(captcha_length)]
    )

    captcha_image = captcha.generate_image(captcha_value)
    captcha_buffer = BytesIO()
    captcha_image.save(captcha_buffer, format="PNG")
    captcha_base64 = base64.b64encode(captcha_buffer.getvalue()).decode("latin1")

    captcha_timestamp = int(time.time())
    captcha_expiry = captcha_timestamp + app.config["CAPTCHA_EXPIRE_SECONDS"]

    captcha_salt = bcrypt.gensalt(rounds=12)
    captcha_code = (str(captcha_expiry) + captcha_value).encode("latin")
    captcha_hash = bcrypt.hashpw(captcha_code, captcha_salt).decode("latin1")

    captcha_jwt = jwt.encode(
        {"hash": captcha_hash, "exp": captcha_expiry},
        key=app.config["CAPTCHA_KEY"],
        algorithm="HS256",
    )

    return captcha_value, captcha_base64, captcha_hash, captcha_jwt


def verifyCaptcha(captcha_answer, token):
    captcha_result = {"valid": False, "expired": False}

    if not captcha_answer:
        return captcha_result

    jwtData = {}

    try:
        jwtData = jwt.decode(
            token,
            key=app.config["CAPTCHA_KEY"],
            algorithms=["HS256"],
            options={"verify_exp": True},
        )
    except ExpiredSignatureError:
        captcha_result["expired"] = True
    # except PyJWTError:
    except Exception as exc:
        pass

    if jwtData:
        captcha_hash = jwtData.get("hash").encode("latin1")
        captcha_expiry = jwtData.get("exp")
        captcha_code = (str(captcha_expiry) + captcha_answer).encode("latin1")
        captcha_result["valid"] = bcrypt.checkpw(captcha_code, captcha_hash)

    return captcha_result


@app.route("/")
def index():
    loggedIn = isLoggedIn()
    return render_template("index.html", loggedIn=loggedIn)


@app.route("/community")
def community():
    loggedIn = isLoggedIn()
    return render_template("community.html", visibility="public", loggedIn=loggedIn)


@app.route("/api/captcha")
def api_captcha():
    captcha_value, captcha_base64, captcha_hash, captcha_jwt = generateCaptcha()
    return jsonify({"b64": captcha_base64, "jwt": captcha_jwt})


@app.route("/api/image/list")
def api_image_list():
    data = []

    token = request.cookies.get("jwt")
    jwtData = decodeFromJWT(token)
    owner = jwtData.get("username")

    forProfile = request.args.get("private", False)

    with dbLock:
        with TinyDB(app.config["DATABASE"]) as db:
            data = []
            images = db.table("images")

            if forProfile and owner:
                data += images.search(Query().owner == owner)
            else:
                data += images.search(Query().public == True)

            # sort such that most recent images comes first
            data.sort(key=lambda image: image["timestamp"], reverse=True)
            data = [image.doc_id for image in data]

    return jsonify(data)


@app.route("/api/image/get/<id>")
def api_image_get(id):
    try:
        id = int(id)
    except ValueError:
        id = None

    if not id:
        return "", 404

    with dbLock:
        with TinyDB(app.config["DATABASE"]) as db:
            images = db.table("images")
            image = images.get(doc_id=id)

            if image:
                images.update(tinydb.operations.increment("views"), doc_ids=[id])

    if not image:
        return "", 404

    filename = image.get("filename")

    if not filename:
        return "", 404

    filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)

    if os.path.isfile(filepath):
        return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

    return "", 404


@app.route("/api/image/info/<id>")
def api_image_info(id):
    try:
        id = int(id)
    except ValueError:
        id = None

    if not id:
        return json.dumps(None), 404

    image = None

    with dbLock:
        with TinyDB(app.config["DATABASE"]) as db:
            images = db.table("images")
            image = images.get(doc_id=id)

    if not image:
        return json.dumps(None), 404

    public = image.get("public")
    owner = image.get("owner")
    filename = image.get("filename")

    token = request.cookies.get("jwt")
    jwtData = decodeFromJWT(token)
    username = jwtData.get("username")

    info = {
        "date": str(datetime.fromtimestamp(image.get("timestamp"))),
        "owner": owner,
        "description": image.get("description"),
        "public": public,
        "likes": len(image.get("likes")),
        "liked": username and username in image.get("likes"),
        "views": image.get("views"),
    }

    if public or owner == username:
        return jsonify(info)

    return json.dumps(None), 403


@app.route("/api/image/delete", methods=["POST"])
def api_image_delete():
    try:
        data = json.loads(request.data.decode("latin1"))
        id = int(data.get("id"))
    # except (JSONDecodeError, TypeError, ValueError):
    except:
        id = None

    if not id:
        return json.dumps(None), 404

    image = None

    with dbLock:
        with TinyDB(app.config["DATABASE"]) as db:
            images = db.table("images")
            image = images.get(doc_id=id)

    if not image:
        return json.dumps(None), 404

    public = image.get("public")
    owner = image.get("owner")
    filename = image.get("filename")

    token = request.cookies.get("jwt")
    jwtData = decodeFromJWT(token)
    username = jwtData.get("username")

    if owner == username:
        filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)

        if os.path.isfile(filepath):
            os.remove(filepath)

            with dbLock:
                with TinyDB(app.config["DATABASE"]) as db:
                    accounts = db.table("accounts")
                    accounts.update(
                        tinydb.operations.decrement("uploads"),
                        Query().username == username,
                    )

                    images = db.table("images")
                    image = images.remove(doc_ids=[id])

                    imageList = images.search(Query().owner == username)
                    totalLikes = totalViews = 0

                    for image in imageList:
                        totalLikes += len(image.get("likes"))
                        totalViews += image.get("views")

            return json.dumps({"totalLikes": totalLikes, "totalViews": totalViews}), 200
        else:
            return json.dumps(None), 404

    return json.dumps(False), 403


@app.route("/api/image/make_public", methods=["POST"])
def api_image_make_public():
    try:
        data = json.loads(request.data.decode("latin1"))
        id = int(data.get("id"))
        value = bool(data.get("value"))
    # except (JSONDecodeError, TypeError, ValueError):
    except:
        id = None
        value = False

    if not id:
        return json.dumps(None), 404

    image = None

    with dbLock:
        with TinyDB(app.config["DATABASE"]) as db:
            images = db.table("images")
            image = images.get(doc_id=id)

    if not image:
        return json.dumps(None), 404

    public = image.get("public")
    owner = image.get("owner")
    filename = image.get("filename")

    token = request.cookies.get("jwt")
    jwtData = decodeFromJWT(token)
    username = jwtData.get("username")

    if owner == username:
        with dbLock:
            with TinyDB(app.config["DATABASE"]) as db:
                images = db.table("images")
                images.update(tinydb.operations.set("public", value), doc_ids=[id])

            return json.dumps(True), 200

    return json.dumps(False), 403


@app.route("/api/image/like", methods=["POST"])
def api_image_like():
    try:
        data = json.loads(request.data.decode("latin1"))
        id = int(data.get("id"))
        value = bool(data.get("value"))
    # except (JSONDecodeError, TypeError, ValueError):
    except:
        id = None
        value = False

    if not id:
        return json.dumps(None), 404

    token = request.cookies.get("jwt")
    jwtData = decodeFromJWT(token)
    username = jwtData.get("username")

    if not username:
        return json.dumps(False), 403

    image = None

    with dbLock:
        with TinyDB(app.config["DATABASE"]) as db:
            images = db.table("images")
            image = images.get(doc_id=id)

    if not image:
        return json.dumps(None), 404

    likesCount = 0
    totalLikes = 0

    with dbLock:
        with TinyDB(app.config["DATABASE"]) as db:
            images = db.table("images")
            image = images.get(doc_id=id)
            likes = image.get("likes")

            if value and username not in likes:
                likes.append(username)
            elif not value and username in likes:
                likes.remove(username)

            images.update(tinydb.operations.set("likes", likes), doc_ids=[id])

            imageList = images.search(Query().owner == username)

            for image in imageList:
                totalLikes += len(image.get("likes"))

            likesCount = len(likes)

    return json.dumps({"likes": likesCount, "totalLikes": totalLikes}), 200


@app.route("/avatar", methods=["GET", "POST"])
def avatar():
    token = request.cookies.get("jwt")
    jwtData = decodeFromJWT(token)

    if not jwtData:
        resp = make_response(redirect(url_for("login")))
        resp.delete_cookie("jwt")
        return resp

    username = jwtData.get("username")

    if request.method == "POST":
        returnURL = request.headers.get("Referer", request.url)
        file = None

        try:
            if "avatar" in request.files:
                file = request.files["avatar"]
            else:
                flash("Invalid request!", "error")
        except RequestEntityTooLarge as exc:
            useragent = request.headers.get("User-Agent", "")
            contentlength = request.headers.get("Content-Length", "")
            sizelimit = app.config["MAX_CONTENT_LENGTH"]

            errors = list(
                map(
                    render_template_string,
                    [
                        "Woah! Your file is too powerful!",
                        f"User-Agent: {useragent}",
                        f"Content-Length: {contentlength}",
                        f"Size Limit: {sizelimit} bytes",
                    ],
                )
            )

            return render_template(
                "layouts/error.html", errors=errors, returnURL=returnURL, loggedIn=True
            )
        else:
            if file:
                if not file.filename:
                    flash("No file selected!", "error")
                else:
                    ext = extension(file.filename)

                    if allowed_file(file.filename):
                        # this will clear `file.stream`, so it will become empty
                        buffer = BytesIO(file.stream.read())

                        try:
                            image = Image.open(buffer)
                        # except PIL.UnidentifiedImageError:
                        except:
                            flash("Invalid image!", "error")
                        else:
                            # `extFromMIME` will be of the form `.EXT`
                            mimetype = image.get_format_mimetype()
                            extFromMIME = mimetypes.guess_extension(mimetype)

                            if allowed_file(extFromMIME):
                                size = image.size

                                # check if the avatar is square or not
                                if size[0] != size[1]:
                                    flash("Uploaded image is not square!", "warning")

                                filename = f"avatar-{username}.png"
                                filepath = os.path.join(
                                    app.config["UPLOAD_FOLDER"], filename
                                )
                                image.save(filepath, format="PNG")

                                with dbLock:
                                    with TinyDB(app.config["DATABASE"]) as db:
                                        accounts = db.table("accounts")
                                        accounts.update(
                                            tinydb.operations.set("avatar", filename),
                                            Query().username == username,
                                        )

                                flash("Avatar updated successfully!", "success")
                            else:
                                flash(f"Invalid mimetype: `{mimetype}`", "error")
                    else:
                        flash(f"Invalid file extension: `{ext}`", "error")
            else:
                flash("No file selected!", "error")

            return redirect(returnURL)

    return avatar_username(username)


@app.route("/avatar/<username>")
def avatar_username(username):
    filename = None

    if validUsername(username):
        with dbLock:
            with TinyDB(app.config["DATABASE"]) as db:
                accounts = db.table("accounts")
                account = accounts.get(Query().username == username)

                if account:
                    filename = account.get("avatar")

    if filename and os.path.isfile(os.path.join(app.config["UPLOAD_FOLDER"], filename)):
        return send_from_directory(app.config["UPLOAD_FOLDER"], filename)
    else:
        return redirect(url_for("static", filename="icons/defaultprofile.png"))


@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.cookies.get("jwt"):
        return redirect(url_for("profile"))

    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        cpassword = request.form.get("cpassword")

        if not username:
            flash("Username cannot be empty!", "error")
            return redirect(request.url)
        else:
            if not validUsername(username):
                flash(
                    "Username can only contain alphabets and digits (4-32 characters)!",
                    "error",
                )
                return redirect(request.url)

        if not password:
            flash("Password cannot be empty!", "error")
            return redirect(request.url)

        if not (8 <= len(password) <= 32):
            flash("Password can have 8-32 characters only!", "error")
            return redirect(request.url)

        if not cpassword:
            flash("Confirmed password cannot be empty!", "error")
            return redirect(request.url)

        if password != cpassword:
            flash("Passwords are not same!", "error")
            return redirect(request.url)

        if app.config["USE_CAPTCHA"]:
            captcha_answer = request.form.get("captcha_answer")
            captcha_jwt = request.form.get("captcha_jwt")

            captcha_result = verifyCaptcha(captcha_answer, captcha_jwt)

            if captcha_result["expired"]:
                flash("CAPTCHA has expired!", "error")
                return redirect(request.url)

            if not captcha_result["valid"]:
                flash("CAPTCHA error!", "error")
                return redirect(request.url)

        newUser = True

        with dbLock:
            with TinyDB(app.config["DATABASE"]) as db:
                accounts = db.table("accounts")
                account = accounts.get(Query().username == username)
                newUser = not account

        if not newUser:
            flash("Username already registered!", "error")
            return redirect(request.url)

        passwd_salt = bcrypt.gensalt(rounds=12)
        passwd_hash = bcrypt.hashpw(password.encode("latin1"), passwd_salt).decode(
            "latin1"
        )

        account = {
            "username": username,
            "passwd_hash": passwd_hash,
            "avatar": None,
            "timestamp": int(time.time()),
            "uploads": 0,
        }

        with dbLock:
            with TinyDB(app.config["DATABASE"]) as db:
                accounts = db.table("accounts")
                accounts.insert(account)

        resp = make_response(redirect(url_for("profile")))
        resp.set_cookie("jwt", encodeToJWT({"username": username}))
        return resp

    return render_template("signup.html", captcha_enabled=app.config["USE_CAPTCHA"])


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.cookies.get("jwt"):
        return redirect(url_for("profile"))

    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")

        if not username:
            flash("Username cannot be empty!", "error")
            return redirect(request.url)

        if not password:
            flash("Password cannot be empty!", "error")
            return redirect(request.url)

        if app.config["USE_CAPTCHA"]:
            captcha_answer = request.form.get("captcha_answer")
            captcha_jwt = request.form.get("captcha_jwt")

            captcha_result = verifyCaptcha(captcha_answer, captcha_jwt)

            if captcha_result["expired"]:
                flash("CAPTCHA has expired!", "error")
                return redirect(request.url)

            if not captcha_result["valid"]:
                flash("CAPTCHA error!", "error")
                return redirect(request.url)

        userExists = False
        validCredentials = False

        with dbLock:
            with TinyDB(app.config["DATABASE"]) as db:
                accounts = db.table("accounts")
                account = accounts.get(Query().username == username)

                if account:
                    userExists = True
                    passwd_hash = account.get("passwd_hash").encode("latin1")
                    validCredentials = bcrypt.checkpw(
                        password.encode("latin1"), passwd_hash
                    )
                else:
                    userExists = False

        if userExists:
            if validCredentials:
                resp = make_response(redirect(url_for("profile")))
                resp.set_cookie("jwt", encodeToJWT({"username": username}))
                return resp
            else:
                flash("Invalid credentials!", "error")
        else:
            flash("This user does not exist!", "error")

    return render_template("login.html", captcha_enabled=app.config["USE_CAPTCHA"])


@app.route("/logout")
def logout():
    resp = make_response(redirect(url_for("login")))
    resp.delete_cookie("jwt")
    return resp


@app.route("/profile")
def profile():
    token = request.cookies.get("jwt")
    jwtData = decodeFromJWT(token)

    if not jwtData:
        resp = make_response(redirect(url_for("login")))
        resp.delete_cookie("jwt")
        return resp

    username = jwtData.get("username")
    uploads = 0
    totalLikes = totalViews = 0

    with dbLock:
        with TinyDB(app.config["DATABASE"]) as db:
            accounts = db.table("accounts")
            account = accounts.get(Query().username == username)

            if account:
                uploads = account.get("uploads", 0)

                images = db.table("images")
                imageList = images.search(Query().owner == username)

                for image in imageList:
                    totalLikes += len(image.get("likes"))
                    totalViews += image.get("views")

    return render_template(
        "profile.html",
        username=username,
        uploads=uploads,
        totalLikes=totalLikes,
        totalViews=totalViews,
        visibility="private",
        loggedIn=True,
    )


@app.route("/api/user/info/<username>")
def api_user_info(username):
    uploads = 0
    totalLikes = 0
    totalViews = 0

    account = None

    with dbLock:
        with TinyDB(app.config["DATABASE"]) as db:
            accounts = db.table("accounts")
            account = accounts.get(Query().username == username)

            if account:
                uploads = account.get("uploads", 0)

                images = db.table("images")
                imageList = images.search(Query().owner == username)

                for image in imageList:
                    totalLikes += len(image.get("likes"))
                    totalViews += image.get("views")

    if not account:
        return json.dumps(None), 404

    info = {
        "date": str(datetime.fromtimestamp(account.get("timestamp"))),
        "username": username,
        "likes": totalLikes,
        "views": totalViews,
    }

    return jsonify(info)


@app.route("/upload", methods=["GET", "POST"])
def upload():
    if not request.cookies.get("jwt"):
        return redirect(url_for("login"))

    token = request.cookies.get("jwt")
    jwtData = decodeFromJWT(token)

    if not jwtData:
        resp = make_response(redirect(url_for("login")))
        resp.delete_cookie("jwt")
        return resp

    username = jwtData.get("username")

    if request.method == "POST":
        # the error will be triggered when we first access the `resquest` object
        try:
            description = request.form.get("description", "")
            file = None

            if "fileToUpload" in request.files:
                file = request.files["fileToUpload"]
            else:
                flash("Invalid request!", "error")

        except RequestEntityTooLarge as exc:
            useragent = request.headers.get("User-Agent", "")
            contentlength = request.headers.get("Content-Length", "")
            sizelimit = app.config["MAX_CONTENT_LENGTH"]

            errors = list(
                map(
                    render_template_string,
                    [
                        "Woah! Your file is too powerful!",
                        f"User-Agent: {useragent}",
                        f"Content-Length: {contentlength}",
                        f"Size Limit: {sizelimit} bytes",
                    ],
                )
            )

            return render_template(
                "layouts/error.html",
                errors=errors,
                returnURL=request.url,
                loggedIn=True,
            )

        else:
            if file:
                if not file.filename:
                    flash("No file selected!", "error")
                else:
                    ext = extension(file.filename)

                    if allowed_file(file.filename):
                        timestamp = time.time()
                        timestamp_hash = md5(str(timestamp).encode("utf-8")).hexdigest()

                        filename = f"{username}-{timestamp_hash}.{ext}"
                        filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
                        file.save(filepath)

                        image = {
                            "filename": filename,
                            "owner": username,
                            "timestamp": int(timestamp),
                            "public": False,
                            "description": description,
                            "likes": [],
                            "views": 0,
                        }

                        with dbLock:
                            with TinyDB(app.config["DATABASE"]) as db:
                                accounts = db.table("accounts")
                                accounts.update(
                                    tinydb.operations.increment("uploads"),
                                    Query().username == username,
                                )

                                images = db.table("images")
                                images.insert(image)

                        flash("File uploaded successfully!", "success")
                    else:
                        flash(f"Invalid file extension: `{ext}`", "error")
            else:
                flash("No file selected!", "error")

            return redirect(request.url)

    return render_template("upload.html", loggedIn=True)


if __name__ == "__main__":
    # to keep the rendered HTML output clean of redundant whitespaces
    app.jinja_env.trim_blocks = True
    app.jinja_env.lstrip_blocks = True

    # for development
    app.config["PRETTIFY"] = True
    prettify = Prettify(app)

    app.run(host="localhost", port="8080")
