$(document).ready(loadImages);

let doNotOwnThisImageMessage = 'You don\'t own this image!',
	invalidRequest = 'Invalid request!';

function loadImages() {
	let pagetype = document.getElementById('images').getAttribute('pagetype');
	let URL = '/api/image/list';

	if (pagetype)
		URL = `${URL}?pagetype=${pagetype}`;

	let xhr = new XMLHttpRequest();
	xhr.open('GET', URL);

	xhr.onreadystatechange = async function() {
		if (xhr.readyState === XMLHttpRequest.DONE) {
			let imageList = JSON.parse(xhr.responseText),
				profileUploadInfo = document.querySelector('#numPhotos'),
				images = document.getElementById('images'),
				imagesMessage = document.getElementById('images-message');

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
			if (xhr.status == 200) {
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

				let imageLikesContainer = imageBox.querySelector('.image-likes-container');
				let imageLikes = imageLikesContainer.querySelector('.image-likes'),
				imageLikeImage = imageLikesContainer.querySelector('.icon-container');

				imageLikes.innerHTML = info.likes;
				imageLikeImage.setAttribute('liked', info.liked);

				if (info.liked)
					imageLikeImage.classList.add('dislike');

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

				image.onload = function() {
					this.style.opacity = '1';
				}

				resolve(imageBox);
			}
			else {
				// we couldn't get any information for this imag
				resolve(null);
			}
		}
	}

	xhr.send();
}

function sortImages(lambda, order) {
	// lambda = (imageBox) => imageBox.getAttribute('image_id')
	// order: 1 (ASC) or -1 (DESC)

	if (!order)
		order = -1;

	let comparator = function(a, b) {
		let a_id = lambda(a), b_id = lambda(b);

		if (a_id < b_id)
			return -1;

		if (a_id > b_id)
			return 1;

		return 0;
	}

	let images = document.getElementById('images'),
		imagesArray = Array.from(images.children);

	let sortedImages = imagesArray.sort(comparator);
	sortedImages.forEach(image => images.appendChild(image));
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
				likeButton.setAttribute('liked', value);

				if (value)
					likeButton.classList.add('dislike');
				else
					likeButton.classList.remove('dislike');

				likes.innerHTML = json.likes;
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
