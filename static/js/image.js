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
	const personName = document.createElement('div');
	personName.classList.add('personNameDiv');
	personName.classList.add('overflow-ellipsis');
	personName.innerText = username;

	// insert the username into `who-liked` list
	whoLiked.appendChild(personName);
}

function loadImages() {
	totalViews();
	let type = document.getElementById('images').getAttribute('value');
	let URL = '/api/image/list';

	if (type === 'private')
		URL = `${URL}?private=1`;

	let xhr = new XMLHttpRequest();
	xhr.open('GET', URL);

	xhr.onreadystatechange = function() {
		if (xhr.readyState === XMLHttpRequest.DONE) {
			let images = JSON.parse(xhr.responseText);

			images.forEach((id) => {
				createImage(id, type === 'private');
			});

			let profileUploadInfo = document.querySelector('#numPhotos');

			if (profileUploadInfo) {
				let numPhotos = images.length;
				profileUploadInfo.innerHTML = `You have uploaded ${numPhotos} photos`;
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
			let numViews = document.getElementById('numViews');

			if (numViews)
				numViews.innerHTML = parseInt(info.views);
		}
	}

	xhr.send();
}

function createImage(id, viewingProfile) {
	/*
	 * images are being added when the XHR is complete (synchronous XHR isn't allowed in main thread)
	 * so they can be inserted in any order
	 * I tried, inserting using binary search using insertAdjacent... methods
	 * but the race-condition is possibly messing up my method
	 * I am leaving with - sortImages();
	 */

	let xhr = new XMLHttpRequest();
	xhr.open('GET', `/api/image/info/${id}`);

	xhr.onreadystatechange = function() {
		if (xhr.readyState === XMLHttpRequest.DONE) {
			// get the image info
			let info = JSON.parse(xhr.responseText);

			// create a clone from our template
			let imageTemplate = document.getElementById('image-box-template');
			let cloneTemplate = imageTemplate.content.cloneNode(true);

			// start filling the template
			let imageBox = cloneTemplate.querySelector('.image-box');
			imageBox.setAttribute('image_id', id);

			let image = imageBox.querySelector('.image');
			image.src = `/api/image/get/${id}`;

			let imageMeta = imageBox.querySelector('.image-meta');
			let imageOwner = imageMeta.querySelector('.image-owner'),
			imageDate = imageMeta.querySelector('.image-date');

			if (!viewingProfile) {
				imageOwner.innerHTML = info.owner;
				imageOwner.setAttribute('title', info.owner);
			}

			imageDate.innerHTML = info.date;

			let imageDescription = imageBox.querySelector('.image-description');
			imageDescription.innerHTML = info.description;
			imageDescription.setAttribute('title', info.description);

			let imageViewsContainer = imageBox.querySelector('.image-views-container');
			let imageViews = imageViewsContainer.querySelector('.image-views');
			imageViews.innerHTML = info.views;

			let numViews = document.getElementById('numViews');

			if (numViews && info.firstSeen) {
				// because we will be viewing it now
				imageViews.innerHTML = parseInt(imageViews.innerHTML) + 1;
				numViews.innerHTML = parseInt(numViews.innerHTML) + 1;
			}

			let imageLikesContainer = imageBox.querySelector('.image-likes-container');
			let imageLikes = imageLikesContainer.querySelector('.image-likes'),
			imageLikeIcon = imageLikesContainer.querySelector('.icon-container');

			let imageLiked = info.likes.includes(getUsername());
			imageLikes.innerHTML = info.likes.length;
			imageLikeIcon.setAttribute('liked', imageLiked);

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

			let changeVisibilityIcon = imageNavButtons[1].children[0];
			let value = 'private';

			if (info.public)
				value = 'public';

			changeVisibilityIcon.src = `static/icons/${value}.png`;
			imageBox.setAttribute('visibility', value);

			let images = document.getElementById('images');
			images.appendChild(imageBox);
			sortImages();

			image.onload = function() {
				this.style.opacity = '1';
			}
		}
	}

	xhr.send();
}

function sortImages() {
	let sort_by_id = function(a, b) {
		let a_id = parseInt(a.getAttribute('image_id')),
			b_id = parseInt(b.getAttribute('image_id'));

		if (a_id < b_id)
			return 1;
		if (a_id > b_id)
			return -1;

		return 0;
	}

	let images = $('#images > .image-box').get();
	images.sort(sort_by_id);
}

function makeImagePublic(event) {
	let imageBox = (event.path || (event.composedPath && event.composedPath()))[4];
	let id = imageBox.getAttribute('image_id');

	// the user might have clicked on the `div`
	// and we are using `(event.path || (event.composedPath && event.composedPath()))` to manipulate data
	// so `id` can be `null`
	if (!id)
		return;

	let img = (event.path || (event.composedPath && event.composedPath()))[0];
	let value = imageBox.getAttribute('visibility') === 'public' ? 'private' : 'public';

	let json = JSON.stringify({
		id: id,
		value: value === 'public'
	});

	let xhr = new XMLHttpRequest();
	xhr.open('POST', '/api/image/make_public');

	xhr.onreadystatechange = function() {
		if (xhr.readyState === XMLHttpRequest.DONE) {
			if (xhr.status === 200) {
				imageBox.setAttribute('visibility', value);
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
	let id = imageBox.getAttribute('image_id');

	// the user might have clicked on the `div`
	// and we are using `(event.path || (event.composedPath && event.composedPath()))` to manipulate data
	// so `id` can be `null`
	if (!id)
		return;

	let likeButton = (event.path || (event.composedPath && event.composedPath()))[1];
	let likes = (event.path || (event.composedPath && event.composedPath()))[2].children[0];
	let value = !(likeButton.getAttribute('liked') === 'true');

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

				let numLikes = document.getElementById('numLikes');
				if (numLikes)
					numLikes.innerHTML = json.totalLikes;

				likeButton.setAttribute('liked', value);

				if (value)
					likeButton.classList.add('dislike');
				else
					likeButton.classList.remove('dislike');

				likes.innerHTML = json.likes.length;

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
	let id = imageBox.getAttribute('image_id');

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

				let numLikes = document.getElementById('numLikes');
				if (numLikes)
					numLikes.innerHTML = json.totalLikes;

				let numViews = document.getElementById('numViews');
				if (numViews)
					numViews.innerHTML = json.totalViews;

				imageBox.remove();

				let images = document.getElementById('images');
				let type = images.getAttribute('value');

				if (type === 'private') {
					let profileNavInfo = document.querySelector('#numPhotos');
					let numPhotos = images.children.length - 1; // -1 for the `<template>` child
					profileNavInfo.innerHTML = `You have uploaded ${numPhotos} photos`;
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
