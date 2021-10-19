$(document).ready(loadImages);

let doNotOwnThisImageMessage = 'You don\'t own this image!',
	invalidRequest = 'Invalid request!';

// We can keep this function in some other file
// if it is required somewhere else
function getUsername() {
	let jwtCookie = $.cookie('jwt');
	try {
		let base64Payload = jwtCookie.split('.')[1];
		let decodedData = JSON.parse(atob(base64Payload));
		return decodedData.username;
	}
	catch (err) {
	}

	return null;
}

function appendUserInLikes(username, whoLiked) {
	const personName = document.createElement('span');
	personName.classList.add('username');
	personName.classList.add('overflow-ellipsis');
	personName.setAttribute('title', username);
	personName.innerText = username;

	// insert the username into `who-liked` list
	whoLiked.appendChild(personName);
}

function loadImages() {
	totalViews();

	let pagetype = $('#images')[0].getAttribute('data-pagetype');
	let URL = '/api/image/list';

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

function totalViews(){
	let username = getUsername();

	if (!username)
		return;

	let xhr = new XMLHttpRequest();
	xhr.open('GET', `/api/user/info/${username}`);

	xhr.onreadystatechange = function() {
		if (xhr.readyState == XMLHttpRequest.DONE) {
			let info = JSON.parse(xhr.responseText);
			let numViews = $('#numViews')[0];

			if (numViews)
				numViews.innerHTML = parseInt(info.views);
		}
	}

	xhr.send();
}

function createImageBox(id, viewingProfile, resolve) {
	let xhr = new XMLHttpRequest();
	xhr.open('GET', `/api/image/info/${id}`);

	xhr.onreadystatechange = function() {
		if (xhr.readyState === XMLHttpRequest.DONE) {
			if (xhr.status == 200) {
				// get the image info
				let info = JSON.parse(xhr.responseText);

				// create a clone from our template
				let imageTemplate = $('#image-box-template')[0];
				let cloneTemplate = imageTemplate.content.cloneNode(true);

				// start filling the template
				let imageBox = cloneTemplate.querySelector('.image-box');
				imageBox.setAttribute('data-id', id);
				imageBox.setAttribute('data-timestamp', new Date(info.time).getTime() / 1000);
				imageBox.setAttribute('data-likes', info.likes.length);
				imageBox.setAttribute('data-views', info.views + info.firstSeen ? 1 : 0);

				let image = imageBox.querySelector('.image');
				image.src = `/api/image/get/${id}`;

				let imageMeta = imageBox.querySelector('.image-meta'),
					imageOwner = imageMeta.querySelector('.image-owner'),
					imageTime = imageMeta.querySelector('.image-time');

				if (!viewingProfile) {
					imageOwner.innerHTML = info.owner;
					imageOwner.setAttribute('title', info.owner);
				}

				imageTime.innerHTML = info.time;
				imageTime.setAttribute('title', info.time);

				let imageDescription = imageBox.querySelector('.image-description');
				imageDescription.innerHTML = info.description;
				imageDescription.setAttribute('title', info.description);

				let imageViewsContainer = imageBox.querySelector('.image-views-container');
				let imageViews = imageViewsContainer.querySelector('.image-views');
				imageViews.innerHTML = info.views;

				let numViews = $('#numViews')[0];

				if (numViews && info.firstSeen) {
					// because we will be viewing it now
					imageViews.innerHTML = parseInt(imageViews.innerHTML) + 1;
					numViews.innerHTML = parseInt(numViews.innerHTML) + 1;
				}

				let imageLikesContainer = imageBox.querySelector('.image-likes-container');
				let imageLikes = imageLikesContainer.querySelector('.image-likes'),
				imageLikeIcon = imageLikesContainer.querySelector('.icon-container');
				$(imageLikeIcon).on('click', (event) => {
					likeImage(event.originalEvent);
				});

				let imageLiked = info.likes.includes(getUsername());
				imageLikes.innerHTML = info.likes.length;
				imageLikeIcon.setAttribute('data-liked', imageLiked);

				if (imageLiked)
					imageLikeIcon.classList.add('dislike');

				var whoLiked = imageBox.querySelector('.who-liked');

				// clear the container
				whoLiked.innerHTML = '';
				info.likes.forEach(username => {
					appendUserInLikes(username, whoLiked);
				});

				let imageNav = imageBox.querySelector('.image-navigation-container');
				let imageNavButtons = imageNav.querySelectorAll('.icon-container');

				let downloadImageLink = imageNav.children[0];
				downloadImageLink.href = `/api/image/get/${id}`;

				let changeVisibilityIcon = imageNavButtons[1].children[0],
					deleteImageIcon = imageNavButtons[1].children[1];

				let value = 'private';

				if (info.public)
					value = 'public';

				changeVisibilityIcon.src = `static/icons/${value}.png`;
				imageBox.setAttribute('data-visibility', value);

				$(changeVisibilityIcon).on('click', (event) => {
					makeImagePublic(event.originalEvent);
				});
				$(deleteImageIcon).on('click', (event) => {
					deleteImage(event.originalEvent);
				});

				image.onload = function() {
					this.style.opacity = '1';
				}

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

function makeImagePublic(event) {
	let imageBox = (event.path || (event.composedPath && event.composedPath()))[4];
	let id = imageBox.getAttribute('data-id');

	// the user might have clicked on the `div`
	// and we are using `(event.path || (event.composedPath && event.composedPath()))` to manipulate data
	// so `id` can be `null`
	if (!id)
		return;

	let img = (event.path || (event.composedPath && event.composedPath()))[0];
	let value = imageBox.getAttribute('data-visibility') === 'public' ? 'private' : 'public';

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
				alert(doNotOwnThisImageMessage);
			else
			if (xhr.status === 404)
				alert(invalidRequest);
			else
				alert('Check your network!');
		}
	};

	xhr.send(json);
}

function likeImage(event) {
	let imageBox = (event.path || (event.composedPath && event.composedPath()))[4];
	let id = imageBox.getAttribute('data-id');

	// the user might have clicked on the `div`
	// and we are using `(event.path || (event.composedPath && event.composedPath()))` to manipulate data
	// so `id` can be `null`
	if (!id)
		return;

	let likeButton = (event.path || (event.composedPath && event.composedPath()))[1];
	let likes = (event.path || (event.composedPath && event.composedPath()))[2].children[0];
	let value = !(likeButton.getAttribute('data-liked') === 'true');

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

				var whoLiked = imageBox.querySelector('.who-liked');

				// clear the container
				whoLiked.innerHTML = '';
				json.likes.forEach(username => {
					appendUserInLikes(username, whoLiked);
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

function deleteImage(event) {
	let imageBox = (event.path || (event.composedPath && event.composedPath()))[4];
	let id = imageBox.getAttribute('data-id');

	// the user might have clicked on the `div`
	// and we are using `(event.path || (event.composedPath && event.composedPath()))` to manipulate data
	// so `id` can be `null`
	if (!id)
		return;

	let json = JSON.stringify({
		id: id,
	});

	let xhr = new XMLHttpRequest();
	xhr.open('POST', '/api/image/delete');

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
				alert(doNotOwnThisImageMessage);
			else
			if (xhr.status === 404)
				alert(invalidRequest);
			else
				alert('Check your network!');
		}
	};

	xhr.send(json);
}
