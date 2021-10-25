$(document).ready(() => {
	loadImages();

	// register 'onclick' event to hide the selected comment
	$('#comment-overlay').on('click', function() {
		$('.comment-box.selected').removeClass('selected');
		this.classList.remove('enabled');
		$('body.no-scroll').removeClass('no-scroll');
	});
});

// to convert `timestamp` to UTC time string
function fromTimestamp(timestamp) {
	return new Date(timestamp * 1000).toUTCString();
}

// We can keep this function in some other file
// if it is required somewhere else
function getUsername() {
	let jwtCookie = $.cookie('jwt');

	try {
		// extract the `payload`
		// format: header.payload.signature
		let base64Payload = jwtCookie.split('.')[1];
		let decodedData = JSON.parse(atob(base64Payload));
		return decodedData.username;
	}
	catch (err) {
	}

	return null;
}

function loadImages() {
	totalViews();

	let pagetype = $('#images')[0].getAttribute('data-pagetype'),
		URL = '/api/image/list';

	if (pagetype)
		URL = `${URL}?pagetype=${pagetype}`;

	let xhr = new XMLHttpRequest();
	xhr.open('GET', URL);

	xhr.onreadystatechange = async function() {
		if (xhr.readyState === XMLHttpRequest.DONE) {
			let imageList = JSON.parse(xhr.responseText),
				profileUploadInfo = $('#numPhotos')[0],
				images = $('#images')[0],
				imagesMessage = $('#images-message')[0];

			if (imageList.length > 0) {
				if (profileUploadInfo)
					profileUploadInfo.innerHTML = `You have uploaded ${imageList.length} photos`;

				for (let idx in imageList) {
					let imageBox = await new Promise(resolve => {
						createImageBox(imageList[idx], pagetype === 'profile', resolve);
					});

					if (imageBox)
						images.appendChild(imageBox);
				}

				imagesMessage.remove();
			}
			else {
				if (profileUploadInfo)
					profileUploadInfo.innerHTML = `You haven't uploaded any photos yet`;

				imagesMessage.innerText = 'Aw snap! No images to show!';
			}
		}
	};

	xhr.send();
}

function createImageBox(id, viewingProfile, resolve) {
	let xhr = new XMLHttpRequest();
	xhr.open('GET', `/api/image/info/${id}`);

	xhr.onreadystatechange = function() {
		if (xhr.readyState === XMLHttpRequest.DONE) {
			if (xhr.status === 200) {
				// get the image info
				let info = JSON.parse(xhr.responseText);

				// create a clone from our template
				let imageTemplate = $('#image-box-template')[0];
				let cloneTemplate = imageTemplate.content.cloneNode(true);

				// start filling the template
				let imageBox = cloneTemplate.querySelector('.image-box');
				imageBox.setAttribute('data-id', id);
				imageBox.setAttribute('data-timestamp', info.timestamp);
				imageBox.setAttribute('data-likes', info.likes.length);
				imageBox.setAttribute('data-views', info.views + (info.firstSeen ? 1 : 0));
				imageBox.setAttribute('data-comments', info.comments.length);

				let image = imageBox.querySelector('.image');
				image.src = `/api/image/get/${id}`;

				let imageMeta = imageBox.querySelector('.image-meta'),
					imageOwner = imageMeta.querySelector('.image-owner'),
					imageTime = imageMeta.querySelector('.image-time');

				if (!viewingProfile) {
					imageOwner.innerHTML = info.owner;
					imageOwner.setAttribute('title', info.owner);
				}

				let time = fromTimestamp(info.timestamp);
				imageTime.innerHTML = time;
				imageTime.setAttribute('title', time);

				let imageDescription = imageBox.querySelector('.image-description');
				imageDescription.innerHTML = info.description;
				imageDescription.setAttribute('title', imageDescription.innerText);

				let imageViewsContainer = imageBox.querySelector('.image-views-container'),
					imageViews = imageViewsContainer.querySelector('.image-views'),
					numViews = $('#numViews')[0];

				imageViews.innerHTML = info.views + (info.firstSeen ? 1 : 0);
				imageViews.setAttribute('title', imageViews.innerText);

				if (numViews && info.firstSeen)
					numViews.innerHTML = parseInt(numViews.innerHTML) + 1;

				let imageCommentContainer = imageBox.querySelector('.image-comments-container'),
					imageComments = imageCommentContainer.querySelector('.image-comments'),
					imageCommentIcon = imageCommentContainer.querySelector('.icon-container');

				imageComments.innerHTML = info.comments.length;
				imageComments.setAttribute('title', info.comments.length);

				$(imageCommentIcon).on('click', () => {
					imageBox.classList.toggle('commenting');
				});

				let imageLikesContainer = imageBox.querySelector('.image-likes-container'),
					imageLikes = imageLikesContainer.querySelector('.image-likes'),
					imageLiked = info.likes.includes(getUsername());

				imageLikes.innerHTML = info.likes.length;
				imageLikes.setAttribute('title', info.likes.length);

				imageLikeIcon = imageLikesContainer.querySelector('.icon-container');
				$(imageLikeIcon).on('click', () => {
					likeImage(imageBox);
				});

				imageLikeIcon.setAttribute('data-liked', imageLiked);

				if (imageLiked)
					imageLikeIcon.classList.add('dislike');

				let commentForm = imageBox.querySelector('.comment-input-form');
				$(commentForm).on('submit', () => {
					postComment(imageBox);
				});

				var whoCommentedList = imageBox.querySelector('.who-commented-list');

				// clear the list
				whoCommentedList.innerHTML = '';
				info.comments.forEach(commentObject => {
					appendCommentInComments(commentObject, whoCommentedList);
				});

				var whoLikedList = imageBox.querySelector('.who-liked-list');

				// clear the list
				whoLikedList.innerHTML = '';
				info.likes.forEach(username => {
					appendUserInLikes(username, whoLikedList);
				});

				let imageNav = imageBox.querySelector('.image-navigation-container'),
					downloadImageLink = imageNav.querySelector('.delete'),
					changeImageVisibilityIcon = imageNav.querySelector('.make-public'),
					changeImageVisibilityIconImage = changeImageVisibilityIcon.querySelector('img'),
					deleteImageIcon = imageNav.querySelector('.delete');

				downloadImageLink.href = `/api/image/get/${id}`;

				let value = info.public ? 'public' : 'private';

				imageBox.setAttribute('data-visibility', value);
				changeImageVisibilityIconImage.src = `/static/icons/${value}.png`;

				$(changeImageVisibilityIcon).on('click', () => {
					makeImagePublic(imageBox);
				});

				$(deleteImageIcon).on('click', () => {
					deleteImage(imageBox);
				});

				image.onload = function() {
					this.style.opacity = '1';
				}

				$(imageBox).on('mouseleave', () => {
					imageBox.classList.remove('commenting');
				});

				resolve(imageBox);
			}
			else {
				// we couldn't get any information for this image
				resolve(null);
			}
		}
	}

	xhr.send();
}

function totalViews() {
	let username = getUsername();

	if (!username)
		return;

	let xhr = new XMLHttpRequest();
	xhr.open('GET', `/api/user/info/${username}`);

	xhr.onreadystatechange = function() {
		if (xhr.readyState === XMLHttpRequest.DONE) {
			let info = JSON.parse(xhr.responseText);
			let numViews = $('#numViews')[0];

			if (numViews)
				numViews.innerHTML = parseInt(info.views);
		}
	}

	xhr.send();
}

function appendUserInLikes(username, whoLikedList) {
	// create a clone from our template
	let usernameTemplate = $('#username-box-template')[0];
	let cloneTemplate = usernameTemplate.content.cloneNode(true);

	// start filling the template
	let usernameBox = cloneTemplate.querySelector('.username-box');
	usernameBox.setAttribute('title', username);

	let usernameSpan = usernameBox.querySelector('.username');
	usernameSpan.innerHTML = username;
	usernameSpan.setAttribute('title', username);

	// insert the username into `who-liked-list` list
	whoLikedList.appendChild(usernameBox);
}

function appendCommentInComments(commentObject, whoCommentedList) {
	// create a clone from our template
	let commentTemplate = $('#comment-box-template')[0];
	let cloneTemplate = commentTemplate.content.cloneNode(true);

	// start filling the template
	let commentBox = cloneTemplate.querySelector('.comment-box');
	commentBox.setAttribute('data-username', commentObject.username);
	commentBox.setAttribute('data-timestamp', commentObject.timestamp);

	let commentUsername = commentBox.querySelector('.comment-username'),
		commentTime = commentBox.querySelector('.comment-time'),
		commentBody = commentBox.querySelector('.comment-body');

	commentUsername.innerHTML = commentObject.username;
	commentUsername.setAttribute('title', commentObject.username);

	let time = fromTimestamp(commentObject.timestamp);
	commentTime.innerHTML = time;
	commentTime.setAttribute('title', time);

	commentBody.innerHTML = commentObject.comment;
	commentBody.setAttribute('title', commentBody.innerText);

	commentBox.setAttribute('title', commentBody.innerText);

	$(commentBox).on('click', () => {
		showComment(commentBox);
	});

	// insert the comment into `who-commented-list` list
	whoCommentedList.appendChild(commentBox);
}

function makeImagePublic(imageBox) {
	let id = imageBox.getAttribute('data-id');
	let imageNavigationContainer = imageBox.querySelector('.image-navigation-container'),
		makePublicIcon = imageNavigationContainer.querySelector('.make-public'),
		img = makePublicIcon.querySelector('img'),
		value = imageBox.getAttribute('data-visibility') === 'public' ? 'private' : 'public';

	let json = JSON.stringify({
		id: id,
		value: value === 'public'
	});

	let xhr = new XMLHttpRequest();
	xhr.open('POST', '/api/image/make_public');

	xhr.onreadystatechange = function() {
		if (xhr.readyState === XMLHttpRequest.DONE) {
			if (xhr.status === 200) {
				imageBox.setAttribute('data-visibility', value);
				img.src = `/static/icons/${value}.png`;
			}
			else
			if (xhr.status === 403)
				alert('You don\'t own this image!');
			else
			if (xhr.status === 404)
				alert('Invalid request!');
			else
				alert('Check your network!');
		}
	};

	xhr.send(json);
}

function likeImage(imageBox) {
	let id = imageBox.getAttribute('data-id');
	let imageLikesContainer = imageBox.querySelector('.image-likes-container'),
		likes = imageLikesContainer.querySelector('.image-likes'),
		likeButton = imageLikesContainer.querySelector('.icon-container'),
		value = !(likeButton.getAttribute('data-liked') === 'true');

	let json = JSON.stringify({
		id: id,
		value: value
	});

	let xhr = new XMLHttpRequest();
	xhr.open('POST', '/api/image/like');

	xhr.onreadystatechange = function() {
		if (xhr.readyState === XMLHttpRequest.DONE) {
			if (xhr.status === 200) {
				let json = JSON.parse(xhr.responseText);

				let numLikes = $('#numLikes')[0];
				if (numLikes)
					numLikes.innerHTML = json.totalLikes;

				likeButton.setAttribute('data-liked', value);

				if (value)
					likeButton.classList.add('dislike');
				else
					likeButton.classList.remove('dislike');

				likes.innerHTML = json.likes.length;
				imageBox.setAttribute('data-likes', json.likes.length);

				var whoLikedList = imageBox.querySelector('.who-liked-list');

				// clear the list
				whoLikedList.innerHTML = '';
				json.likes.forEach(username => {
					appendUserInLikes(username, whoLikedList);
				});
			}
			else
			if (xhr.status === 403)
				alert('You need to be logged in to like an image!');
			else
			if (xhr.status === 404)
				alert('Invalid request, refresh the page!');
			else
				alert('Check your network!');
		}
	};

	xhr.send(json);
}

function postComment(imageBox) {
	// stop the form submission
	event.preventDefault();

	let id = imageBox.getAttribute('data-id'),
		commentInput = imageBox.querySelector('.comment-input'),
		value = commentInput.value;

	let json = JSON.stringify({
		id: id,
		value: value
	});

	let xhr = new XMLHttpRequest();
	xhr.open('POST', '/api/image/comment');

	xhr.onreadystatechange = function() {
		if (xhr.readyState === XMLHttpRequest.DONE) {
			if (xhr.status === 200) {
				let json = JSON.parse(xhr.responseText);

				let comments = imageBox.querySelector('.image-comments');
				comments.innerHTML = json.comments.length;

				let commentForm = imageBox.querySelector('.comment-input-form');
				commentForm.reset();

				var whoCommentedList = imageBox.querySelector('.who-commented-list');

				// clear the list
				whoCommentedList.innerHTML = '';
				json.comments.forEach(commentObject => {
					appendCommentInComments(commentObject, whoCommentedList);
				});

				imageBox.classList.remove('commenting');
			}
			else
			if (xhr.status === 403)
				alert('You need to be logged in to comment on an image!');
			else
			if (xhr.status === 404)
				alert('Invalid request, refresh the page!');
			else
				alert('Check your network!');
		}
	};

	xhr.send(json);
}

function deleteImage(imageBox) {
	let id = imageBox.getAttribute('data-id');

	let xhr = new XMLHttpRequest();
	xhr.open('POST', `/api/image/delete/${id}`);

	xhr.onreadystatechange = function() {
		if (xhr.readyState === XMLHttpRequest.DONE) {
			if (xhr.status === 200) {
				let json = JSON.parse(xhr.responseText);

				let numLikes = $('#numLikes')[0];
				if (numLikes)
					numLikes.innerHTML = json.totalLikes;

				let numViews = $('#numViews')[0];
				if (numViews)
					numViews.innerHTML = json.totalViews;

				imageBox.remove();

				let images = $('#images')[0];
				let pagetype = images.getAttribute('data-pagetype');

				if (pagetype === 'profile') {
					let profileUploadInfo = $('#numPhotos')[0],
						numPhotos = images.children.length;

					if (numPhotos > 0)
						profileUploadInfo.innerHTML = `You have uploaded ${numPhotos} photos`;
					else
						profileUploadInfo.innerHTML = `You haven't uploaded any photos yet`;
				}
			}
			else
			if (xhr.status === 403)
				alert('You don\'t own this image!');
			else
			if (xhr.status === 404)
				alert('Invalid request!');
			else
				alert('Check your network!');
		}
	};

	xhr.send();
}

function showComment(commentBox) {
	// will implement this later
	return;

	// mark the current commentBox as being selected
	commentBox.classList.add('selected');

	// enable the comment overlay
	// we have already registered an event listener
	// for `onclick` event to hide the `modal`
	$('#comment-overlay').addClass('enabled');
	$('body').addClass('no-scroll');
}
