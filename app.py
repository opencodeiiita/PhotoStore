#!/usr/bin/env python

# for system operations, file handling
import base64
import os
import random
import string
import time
from hashlib import md5
import mimetypes
from pathlib import Path

# for image handling
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
    send_from_directory,
)
from werkzeug.exceptions import RequestEntityTooLarge
from flask_talisman import Talisman

# we will be using hashes
# from werkzeug.utils import secure_filename

# to prettify the rendered HTML document
from flask_pretty import Prettify

# to sanitize input
import re
from markupsafe import escape

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
UPLOAD_DIR = CWD / "uploads"
ALLOWED_EXTENSIONS = {"jpg", "png", "svg", "jpeg"}

# flask app
app = Flask(__name__)
app.config["UPLOAD_DIR"] = UPLOAD_DIR
app.config["SECRET_KEY"] = SECRET_KEY
app.config["CAPTCHA_KEY"] = CAPTCHA_KEY
app.config["CAPTCHA_EXPIRE_SECONDS"] = 5 * 60  # 5 minutes
app.config["MAX_CONTENT_LENGTH"] = 1 * 1000 * 1000  # 1MB limit
app.config["DATABASE"] = "photostore.db"
app.config["USE_CAPTCHA"] = False

# apply Talisman
csp = {
    "default-src": "'self'",
    "img-src": "'self' data:"
}

talisman = Talisman(app, force_https=False, content_security_policy=csp)

# for CAPTCHA
captcha = ImageCaptcha()

# for local database (but this table is not used)
TinyDB.default_table_name = "photostore"
db_lock = Lock()


def allowed_file(filename):
    return extension(filename).lower() in ALLOWED_EXTENSIONS


def extension(filename):
    return "" if "." not in filename else filename.rsplit(".", 1)[1]


def is_valid_username(username):
    return username and re.match(r"^[0-9A-Z_]{4,32}$", username, flags=re.I)


def is_logged_in():
    token = request.cookies.get("jwt")
    jwt_data = decode_from_jwt(token)
    return bool(jwt_data)


def encode_to_jwt(data):
    return jwt.encode(data, key=app.config["SECRET_KEY"], algorithm="HS256")


def decode_from_jwt(token):
    jwt_data = {}

    try:
        jwt_data = jwt.decode(
            token,
            key=app.config["SECRET_KEY"],
            algorithms=["HS256"]
        )
    except PyJWTError:
        pass

    return jwt_data


def generate_captcha():
    # select a random length between 6 and 10
    captcha_length = random.choice(range(6, 10 + 1))
    captcha_value = "".join(
        [random.choice(string.ascii_lowercase) for _ in range(captcha_length)]
    )

    captcha_image = captcha.generate_image(captcha_value)
    captcha_buffer = BytesIO()
    captcha_image.save(captcha_buffer, format="PNG")
    captcha_base64 = base64.b64encode(
        captcha_buffer.getvalue()
    ).decode("latin1")

    captcha_timestamp = int(time.time())
    captcha_expiry = captcha_timestamp + app.config["CAPTCHA_EXPIRE_SECONDS"]

    captcha_salt = bcrypt.gensalt(rounds=12)
    captcha_code = (str(captcha_expiry) + captcha_value).encode("latin")
    captcha_hash = bcrypt.hashpw(captcha_code, captcha_salt).decode("latin1")

    captcha_jwt = jwt.encode(
        {
            "hash": captcha_hash,
            "exp": captcha_expiry
        },
        key=app.config["CAPTCHA_KEY"],
        algorithm="HS256",
    )

    return captcha_value, captcha_base64, captcha_hash, captcha_jwt


def verify_captcha(captcha_answer, token):
    captcha_result = {"valid": False, "expired": False}

    if not captcha_answer:
        return captcha_result

    jwt_data = {}

    try:
        jwt_data = jwt.decode(
            token,
            key=app.config["CAPTCHA_KEY"],
            algorithms=["HS256"],
            options={"verify_exp": True},
        )
    except ExpiredSignatureError:
        captcha_result["expired"] = True
    except PyJWTError:
        pass

    if jwt_data:
        captcha_hash = jwt_data["hash"].encode("latin1")
        captcha_expiry = jwt_data["exp"]
        captcha_code = (str(captcha_expiry) + captcha_answer).encode("latin1")
        captcha_result["valid"] = bcrypt.checkpw(captcha_code, captcha_hash)

    return captcha_result


def no_cache(func):
    def inner(*args, **kwargs):
        resp = func(*args, **kwargs)
        resp.headers["Cache-Control"] = "no-cache, no-store, max-age=0"
        return resp

    # for the view function name assertion by Flask
    inner.__name__ = func.__name__
    return inner


# `@app.errorhandler(413)` can also be used
@app.errorhandler(RequestEntityTooLarge)
def request_entity_too_large(_):
    useragent = request.headers.get("User-Agent", "")
    contentlength = request.headers.get("Content-Length", "")
    max_size_limit = app.config["MAX_CONTENT_LENGTH"]

    errors = [
        "Woah! Your file is too powerful!",
        f"User-Agent: {useragent}",
        f"Content-Length: {contentlength}",
        f"Maximum allowed size: {max_size_limit} bytes",
    ]

    resp = make_response(
        render_template(
            "layouts/error.html",
            errors=errors,
            return_url=request.referrer,
            logged_in=True,
        ),
        413
    )

    return resp


@app.route("/")
def index():
    logged_in = is_logged_in()
    return render_template(
        "index.html",
        pagetype="index",
        logged_in=logged_in
    )


@app.route("/community")
def community():
    logged_in = is_logged_in()
    return render_template(
        "community.html",
        pagetype="community",
        logged_in=logged_in
    )


@app.route("/api/captcha")
def api_captcha():
    (
        _,  # captcha_value
        captcha_base64,
        _,  # captcha_hash
        captcha_jwt
    ) = generate_captcha()

    return jsonify({
        "b64": captcha_base64,
        "jwt": captcha_jwt
    })


@app.route("/api/image/list")
@no_cache
def api_image_list():
    data = []

    token = request.cookies.get("jwt")
    jwt_data = decode_from_jwt(token)
    owner = jwt_data.get("username")

    which_page = request.args.get("pagetype", "index")

    with db_lock:
        with TinyDB(app.config["DATABASE"]) as db:
            data = []
            images = db.table("images")

            if which_page == "profile" and owner:
                data += images.search(Query().owner == owner)
            else:
                data += images.search(Query().public == True)  # noqa: E712

            if which_page == "index":
                # sort such that images with most likes and views comes first
                data.sort(
                    key=lambda image: len(image["likes"]) + len(image["views"]),
                    reverse=True,
                )
                data = [image.doc_id for image in data[:4]]
            else:
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
        return ("", 404)

    token = request.cookies.get("jwt")
    jwt_data = decode_from_jwt(token)
    username = jwt_data.get("username")

    with db_lock:
        with TinyDB(app.config["DATABASE"]) as db:
            images = db.table("images")
            image = images.get(doc_id=id)

            if image:
                views = image.get("views")

                if username and username not in views:
                    views.append(username)
                    images.update(
                        tinydb.operations.set("views", views),
                        doc_ids=[id]
                    )

    if not image:
        return ("", 404)

    public = image.get("public")
    owner = image.get("owner")
    filename = image.get("filename")

    # check if the client has access to view this image or not
    # this check prevents IDOR
    if not owner == username and not public:
        return ("", 403)

    filepath = os.path.join(app.config["UPLOAD_DIR"], filename)

    if os.path.isfile(filepath):
        resp = make_response(send_from_directory(
            app.config["UPLOAD_DIR"],
            filename
        ))

        # images won't change, so they can be cached
        resp.headers["Cache-Control"] = "max-age=31536000, immutable"
        return resp

    return ("", 404)


@app.route("/api/image/info/<id>")
@no_cache
def api_image_info(id):
    try:
        id = int(id)
    except ValueError:
        id = None

    if not id:
        return (json.dumps(None), 404)

    image = None

    with db_lock:
        with TinyDB(app.config["DATABASE"]) as db:
            images = db.table("images")
            image = images.get(doc_id=id)

    if not image:
        return (json.dumps(None), 404)

    public = image.get("public")
    owner = image.get("owner")

    token = request.cookies.get("jwt")
    jwt_data = decode_from_jwt(token)
    username = jwt_data.get("username")

    info = {
        "timestamp": image.get("timestamp"),
        "owner": owner,
        "description": image.get("description"),
        "public": public,
        "likes": image.get("likes"),
        "views": len(image.get("views")),
        "comments": image.get("comments"),
        "firstSeen": username and username not in image.get("views"),
    }

    if public or owner == username:
        return jsonify(info)

    return (json.dumps(None), 403)


@app.route("/api/image/delete/<id>", methods=["POST"])
@no_cache
def api_image_delete(id):
    try:
        id = int(id)
    except ValueError:
        id = None

    if not id:
        return (json.dumps(None), 404)

    image = None

    with db_lock:
        with TinyDB(app.config["DATABASE"]) as db:
            images = db.table("images")
            image = images.get(doc_id=id)

    if not image:
        return (json.dumps(None), 404)

    owner = image.get("owner")
    filename = image.get("filename")

    token = request.cookies.get("jwt")
    jwt_data = decode_from_jwt(token)
    username = jwt_data.get("username")

    if owner == username:
        filepath = os.path.join(app.config["UPLOAD_DIR"], filename)

        if os.path.isfile(filepath):
            os.remove(filepath)

            with db_lock:
                with TinyDB(app.config["DATABASE"]) as db:
                    accounts = db.table("accounts")
                    accounts.update(
                        tinydb.operations.decrement("uploads"),
                        Query().username == username,
                    )

                    images = db.table("images")
                    image = images.remove(doc_ids=[id])

                    imageList = images.search(Query().owner == username)
                    total_likes = total_views = 0

                    for image in imageList:
                        total_likes += len(image.get("likes"))
                        total_views += len(image.get("views"))

            info = {"total_likes": total_likes, "total_views": total_views}
            return jsonify(info)
        else:
            return (json.dumps(None), 404)

    return (json.dumps(False), 403)


@app.route("/api/image/make_public", methods=["POST"])
@no_cache
def api_image_make_public():
    try:
        data = json.loads(request.data.decode("latin1"))
        id = int(data.get("id"))
        value = bool(data.get("value"))
    except (json.JSONDecodeError, TypeError, ValueError):
        id = None
        value = False

    if not id:
        return (json.dumps(None), 404)

    image = None

    with db_lock:
        with TinyDB(app.config["DATABASE"]) as db:
            images = db.table("images")
            image = images.get(doc_id=id)

    if not image:
        return (json.dumps(None), 404)

    owner = image.get("owner")

    token = request.cookies.get("jwt")
    jwt_data = decode_from_jwt(token)
    username = jwt_data.get("username")

    if owner == username:
        with db_lock:
            with TinyDB(app.config["DATABASE"]) as db:
                images = db.table("images")
                images.update(
                    tinydb.operations.set("public", value),
                    doc_ids=[id]
                )

            return (json.dumps(True), 200)

    return (json.dumps(False), 403)


@app.route("/api/image/like", methods=["POST"])
@no_cache
def api_image_like():
    try:
        data = json.loads(request.data.decode("latin1"))
        id = int(data.get("id"))
        value = bool(data.get("value"))
    except (json.JSONDecodeError, TypeError, ValueError):
        id = None
        value = False

    if not id:
        return (json.dumps(None), 404)

    token = request.cookies.get("jwt")
    jwt_data = decode_from_jwt(token)
    username = jwt_data.get("username")

    if not username:
        return (json.dumps(False), 403)

    image = None

    with db_lock:
        with TinyDB(app.config["DATABASE"]) as db:
            images = db.table("images")
            image = images.get(doc_id=id)

    if not image:
        return (json.dumps(None), 404)

    total_likes = 0

    with db_lock:
        with TinyDB(app.config["DATABASE"]) as db:
            images = db.table("images")
            image = images.get(doc_id=id)
            likes = image.get("likes")

            if value and username not in likes:
                likes.append(username)
            elif not value and username in likes:
                likes.remove(username)

            images.update(
                tinydb.operations.set("likes", likes),
                doc_ids=[id]
            )

            imageList = images.search(Query().owner == username)

            for image in imageList:
                total_likes += len(image.get("likes"))

    return (
        json.dumps({
            "likes": likes,
            "total_likes": total_likes
        }),
        200
    )


@app.route("/api/image/comment", methods=["POST"])
@no_cache
def api_image_comment():
    try:
        data = json.loads(request.data.decode("latin1"))
        id = int(data.get("id"))
        value = data.get("value")
    except (json.JSONDecodeError, TypeError, ValueError):
        id = None
        value = None

    if not id or not value:
        return (json.dumps(None), 404)

    token = request.cookies.get("jwt")
    jwt_data = decode_from_jwt(token)
    username = jwt_data.get("username")

    if not username:
        return (json.dumps(False), 403)

    image = None

    with db_lock:
        with TinyDB(app.config["DATABASE"]) as db:
            images = db.table("images")
            image = images.get(doc_id=id)

    if not image:
        return (json.dumps(None), 404)

    with db_lock:
        with TinyDB(app.config["DATABASE"]) as db:
            images = db.table("images")
            image = images.get(doc_id=id)
            comments = image.get("comments")
            timestamp = int(time.time())

            comments.append({
                "username": username,
                "comment": escape(value),
                "timestamp": timestamp
            })

            images.update(
                tinydb.operations.set("comments", comments),
                doc_ids=[id]
            )

    return (json.dumps({"comments": comments}), 200)


@app.route("/avatar", methods=["GET", "POST"])
def avatar():
    token = request.cookies.get("jwt")
    jwt_data = decode_from_jwt(token)

    if not jwt_data:
        resp = make_response(redirect(url_for("login")))
        resp.delete_cookie("jwt")
        return resp

    username = jwt_data.get("username")

    if request.method == "POST":
        return_url = request.headers.get("Referer", request.url)
        file = None

        if "avatar" in request.files:
            file = request.files.get("avatar")
        else:
            flash("Invalid request!", "error")
            return redirect(return_url)

        if not file:
            flash("No file selected!", "error")
            return redirect(return_url)

        if not file.filename:
            flash("No file selected!", "error")
            return redirect(return_url)

        # extract the file extension
        ext = extension(file.filename)

        if not allowed_file(file.filename):
            flash(f"Invalid file extension: `{ext}`", "error")
            return redirect(return_url)

        # this will clear `file.stream`, so it will become empty
        buffer = BytesIO(file.stream.read())
        image = None

        try:
            image = Image.open(buffer)
        except UnidentifiedImageError:
            flash("Invalid image!", "error")
        else:
            # `ext_from_mime` will be of the form `.ext`
            mimetype = image.get_format_mimetype()
            ext_from_mime = mimetypes.guess_extension(mimetype)

            if not allowed_file(ext_from_mime):
                flash(f"Invalid mimetype: `{mimetype}`", "error")
                return redirect(return_url)

            # check if the avatar is square or not
            size = image.size

            if size[0] != size[1]:
                flash(
                    "Uploaded image is not square!",
                    "warning"
                )

            filename = f"avatar-{username}.png"
            filepath = os.path.join(
                app.config["UPLOAD_DIR"],
                filename
            )

            # save the image in PNG-format
            image.save(filepath, format="PNG")

            with db_lock:
                with TinyDB(app.config["DATABASE"]) as db:
                    accounts = db.table("accounts")
                    accounts.update(
                        tinydb.operations.set("avatar", filename),
                        Query().username == username,
                    )

            flash("Avatar updated successfully!", "success")

        return redirect(return_url)

    # re-use the already implemented method
    return avatar_username(username)


@app.route("/avatar/<username>")
def avatar_username(username):
    filename = None

    if is_valid_username(username):
        with db_lock:
            with TinyDB(app.config["DATABASE"]) as db:
                accounts = db.table("accounts")
                account = accounts.get(Query().username == username)

                if account:
                    filename = account.get("avatar")

    if (
        filename and
        os.path.isfile(os.path.join(app.config["UPLOAD_DIR"], filename))
    ):
        return send_from_directory(app.config["UPLOAD_DIR"], filename)
    else:
        return redirect(url_for("static", filename="icons/defaultprofile.png"))


@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.cookies.get("jwt"):
        return redirect(url_for("profile"))

    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        confirm_password = request.form.get("confirm-password")

        if not username:
            flash("Username cannot be empty!", "error")
            return redirect(request.url)

        if not is_valid_username(username):
            flash((
                "Username can only contain: " +
                "alphabets, digits and underscores"
            ), "error")
            return redirect(request.url)

        if not password:
            flash("Password cannot be empty!", "error")
            return redirect(request.url)

        if not (8 <= len(password) <= 32):
            flash("Password can have 8-32 characters only!", "error")
            return redirect(request.url)

        if not confirm_password:
            flash("Confirmed password cannot be empty!", "error")
            return redirect(request.url)

        if password != confirm_password:
            flash("Passwords are not same!", "error")
            return redirect(request.url)

        if app.config["USE_CAPTCHA"]:
            captcha_answer = request.form.get("captcha_answer")
            captcha_jwt = request.form.get("captcha_jwt")

            captcha_result = verify_captcha(captcha_answer, captcha_jwt)

            if captcha_result["expired"]:
                flash("CAPTCHA has expired!", "error")
                return redirect(request.url)

            if not captcha_result["valid"]:
                flash("CAPTCHA error!", "error")
                return redirect(request.url)

        user_registered = True

        with db_lock:
            with TinyDB(app.config["DATABASE"]) as db:
                accounts = db.table("accounts")
                account = accounts.get(Query().username == username)
                user_registered = account is not None

        if user_registered:
            flash("Username already registered!", "error")
            return redirect(request.url)

        passwd_salt = bcrypt.gensalt(rounds=12)
        passwd_hash = bcrypt.hashpw(
            password.encode("latin1"),
            passwd_salt
        ).decode("latin1")

        account = {
            "username": username,
            "passwd_hash": passwd_hash,
            "avatar": None,
            "timestamp": int(time.time()),
            "uploads": 0,
        }

        with db_lock:
            with TinyDB(app.config["DATABASE"]) as db:
                accounts = db.table("accounts")
                accounts.insert(account)

        resp = make_response(redirect(url_for("profile")))
        resp.set_cookie("jwt", encode_to_jwt({"username": username}))
        return resp

    return render_template(
        "signup.html",
        captcha_enabled=app.config["USE_CAPTCHA"]
    )


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

            captcha_result = verify_captcha(captcha_answer, captcha_jwt)

            if captcha_result["expired"]:
                flash("CAPTCHA has expired!", "error")
                return redirect(request.url)

            if not captcha_result["valid"]:
                flash("CAPTCHA error!", "error")
                return redirect(request.url)

        user_registered = False
        valid_credentials = False

        with db_lock:
            with TinyDB(app.config["DATABASE"]) as db:
                accounts = db.table("accounts")
                account = accounts.get(Query().username == username)

                if account:
                    user_registered = True
                    passwd_hash = account.get("passwd_hash").encode("latin1")
                    valid_credentials = bcrypt.checkpw(
                        password.encode("latin1"), passwd_hash
                    )

        if user_registered:
            if valid_credentials:
                resp = make_response(redirect(url_for("profile")))
                resp.set_cookie("jwt", encode_to_jwt({"username": username}))
                return resp
            else:
                flash("Invalid credentials!", "error")
        else:
            flash("This user does not exist!", "error")

    return render_template(
        "login.html",
        captcha_enabled=app.config["USE_CAPTCHA"]
    )


@app.route("/logout")
def logout():
    resp = make_response(redirect(url_for("login")))
    resp.delete_cookie("jwt")
    return resp


@app.route("/profile")
def profile():
    token = request.cookies.get("jwt")
    jwt_data = decode_from_jwt(token)
    username = jwt_data.get("username")

    if not jwt_data:
        resp = make_response(redirect(url_for("login")))
        resp.delete_cookie("jwt")
        return resp

    uploads = 0
    total_likes = total_views = 0

    with db_lock:
        with TinyDB(app.config["DATABASE"]) as db:
            accounts = db.table("accounts")
            account = accounts.get(Query().username == username)

            if account:
                uploads = account.get("uploads", 0)

                images = db.table("images")
                imageList = images.search(Query().owner == username)

                for image in imageList:
                    total_likes += len(image.get("likes"))
                    total_views += len(image.get("views"))

    return render_template(
        "profile.html",
        username=username,
        uploads=uploads,
        total_likes=total_likes,
        total_views=total_views,
        pagetype="profile",
        logged_in=True,
    )


@app.route("/api/user/info/<username>")
@no_cache
def api_user_info(username):
    uploads = 0
    total_likes = 0
    total_views = 0

    account = None

    with db_lock:
        with TinyDB(app.config["DATABASE"]) as db:
            accounts = db.table("accounts")
            account = accounts.get(Query().username == username)

            if account:
                uploads = account.get("uploads", 0)

                images = db.table("images")
                imageList = images.search(Query().owner == username)

                for image in imageList:
                    total_likes += len(image.get("likes"))
                    total_views += len(image.get("views"))

    if not account:
        return (json.dumps(None), 404)

    info = {
        "timestamp": account.get("timestamp"),
        "username": username,
        "likes": total_likes,
        "views": total_views,
        "uploads": uploads,
    }

    return jsonify(info)


@app.route("/upload", methods=["GET", "POST"])
def upload():
    if not request.cookies.get("jwt"):
        return redirect(url_for("login"))

    token = request.cookies.get("jwt")
    jwt_data = decode_from_jwt(token)

    if not jwt_data:
        resp = make_response(redirect(url_for("login")))
        resp.delete_cookie("jwt")
        return resp

    username = jwt_data.get("username")

    if request.method == "POST":
        # this prevents HTML code from being stored
        # directly into the database
        # thus preventing stored XSS vulnerability
        description = escape(request.form.get("description", ""))
        file = None

        if "fileToUpload" in request.files:
            file = request.files.get("fileToUpload")
        else:
            flash("Invalid request!", "error")

        if not file or not file.filename:
            flash("No file selected!", "error")
            return redirect(request.url)

        ext = extension(file.filename)

        if allowed_file(file.filename):
            timestamp = time.time()
            timestamp_hash = md5(
                str(timestamp).encode("utf-8")
            ).hexdigest()

            filename = f"{username}-{timestamp_hash}.{ext}"
            filepath = os.path.join(app.config["UPLOAD_DIR"], filename)
            file.save(filepath)

            image = {
                "filename": filename,
                "owner": username,
                "timestamp": int(timestamp),
                "public": False,
                "description": description,
                "likes": [],
                "views": [],
                "comments": [],
            }

            with db_lock:
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

    return render_template(
        "upload.html",
        logged_in=True
    )


@app.route("/reset-password", methods=["GET", "POST"])
def reset_pwd():
    if not request.cookies.get("jwt"):
        return redirect(url_for("login"))

    token = request.cookies.get("jwt")
    jwt_data = decode_from_jwt(token)

    if not jwt_data:
        resp = make_response(redirect(url_for("login")))
        resp.delete_cookie("jwt")
        return resp

    username = jwt_data.get("username")

    if request.method == "POST":
        current_password = request.form.get("current-password")
        new_password = request.form.get("new-password")
        confirm_new_password = request.form.get("confirm-new-password")

        if (
            current_password is None or
            new_password is None or
            confirm_new_password is None
        ):
            flash("Invalid form submission!", "error")
            return redirect(request.url)

        if not (8 <= len(new_password) <= 32):
            flash("Password can have 8-32 characters only!", "error")
            return redirect(request.url)

        if new_password != confirm_new_password:
            flash("Passwords are not same!", "error")
            return redirect(request.url)

        if app.config["USE_CAPTCHA"]:
            captcha_answer = request.form.get("captcha_answer")
            captcha_jwt = request.form.get("captcha_jwt")

            captcha_result = verify_captcha(captcha_answer, captcha_jwt)

            if captcha_result["expired"]:
                flash("CAPTCHA has expired!", "error")
                return redirect(request.url)

            if not captcha_result["valid"]:
                flash("CAPTCHA error!", "error")
                return redirect(request.url)

        account = None
        valid_credentials = False

        with db_lock:
            with TinyDB(app.config["DATABASE"]) as db:
                accounts = db.table("accounts")
                account = accounts.get(Query().username == username)

                if account:
                    passwd_hash = account.get("passwd_hash").encode("latin1")
                    valid_credentials = bcrypt.checkpw(
                        current_password.encode("latin1"),
                        passwd_hash
                    )

        if valid_credentials:
            passwd_salt = bcrypt.gensalt(rounds=12)
            passwd_hash = bcrypt.hashpw(
                new_password.encode("latin1"),
                passwd_salt
            ).decode("latin1")

            account["passwd_hash"] = passwd_hash

            with db_lock:
                with TinyDB(app.config["DATABASE"]) as db:
                    accounts = db.table("accounts")
                    accounts.update(account)

            flash("Password updated successfully", "success")
            return redirect(url_for("profile"))
        else:
            flash("Invalid credentials!", "error")

    return render_template(
        "reset-password.html",
        captcha_enabled=app.config["USE_CAPTCHA"],
        logged_in=True,
    )


if __name__ == "__main__":
    # to keep the rendered HTML output clean of redundant whitespaces
    app.jinja_env.trim_blocks = True
    app.jinja_env.lstrip_blocks = True

    # for development
    app.config["PRETTIFY"] = True
    prettify = Prettify(app)

    app.run(host="localhost", port=8080)
