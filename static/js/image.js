$(document).ready(loadImages);

var doNotOwnThisImageMessage = "You don't own this image!",
	invalidRequest = 'Invalid request!';

function loadImages() {
	var type = document.getElementById('images').getAttribute('value');
	var URL = '/api/image/list';

	if (type == 'private')
		URL = `${URL}?private=1`;

	var xhr = new XMLHttpRequest();
	xhr.open('GET', URL);

	xhr.onreadystatechange = function() {
		if (xhr.readyState == XMLHttpRequest.DONE) {
			var images = JSON.parse(xhr.responseText);

			images.forEach((id) => {
				createImage(id, type == 'private');
			});

			var profileUploadInfo = document.querySelector('#numPhotos');

			if (profileUploadInfo) {
				var numPhotos = images.length;
				profileUploadInfo.innerHTML = `You have uploaded ${numPhotos} photos`;
			}

		}
	};

	xhr.send();
}

function createImage(id, viewingProfile) {
	/*
	 * images are being added when the XHR is complete (synchronous XHR isn't allowed in main thread)
	 * so they can be inserted in any order
	 * I tried, inerting using binary search using insertAdjacent... methods
	 * but the race-condition is possibly messing up my method
	 * I am leaving with - sortImages();
	 */

	var xhr = new XMLHttpRequest();
	xhr.open('GET', `/api/image/info/${id}`);

	xhr.onreadystatechange = function() {
		if (xhr.readyState == XMLHttpRequest.DONE) {
			// get the image info
			var info = JSON.parse(xhr.responseText);

			// create a clone from our template
			var imageTemplate = document.getElementById('image-box-template');
			var cloneTemplate = imageTemplate.content.cloneNode(true);

			// start filling the template
			var imageBox = cloneTemplate.querySelector('.image-box');
			imageBox.setAttribute('image_id', id);

			var image = imageBox.querySelector('.image');
			image.src = `/api/image/get/${id}`;

			var imageMeta = imageBox.querySelector('.image-meta');
			var imageOwner = imageMeta.querySelector('.image-owner'),
			imageDate = imageMeta.querySelector('.image-date');

			if (!viewingProfile) {
				imageOwner.innerHTML = info.owner;
				imageOwner.setAttribute('title', info.owner);
			}

			imageDate.innerHTML = info.date;

			var imageDescription = imageBox.querySelector('.image-description');
			imageDescription.innerHTML = info.description;
			imageDescription.setAttribute('title', info.description);

			var imageViewsContainer = imageBox.querySelector('.image-views-container');
			var imageViews = imageViewsContainer.querySelector('.image-views');

			imageViews.innerHTML = info.views;

			var imageLikesContainer = imageBox.querySelector('.image-likes-container');
			var imageLikes = imageLikesContainer.querySelector('.image-likes'),
			imageLikeImage = imageLikesContainer.querySelector('.icon-container');

			imageLikes.innerHTML = info.likes;
			imageLikeImage.setAttribute('liked', info.liked);

			if (info.liked)
				imageLikeImage.classList.add('dislike');

			var imageNav = imageBox.querySelector('.image-navigation-container');
			var imageNavButtons = imageNav.querySelectorAll('.icon-container');

			var downloadImageLink = imageNav.children[0];
			downloadImageLink.href = `/api/image/get/${id}`;

			var changeVisibilityIcon = imageNavButtons[1].children[0];
			var value = 'private';

			if (info.public)
				value = 'public';

			changeVisibilityIcon.src = `static/icons/${value}.png`;
			imageBox.setAttribute('visibility', value);

			var images = document.getElementById('images');
			images.appendChild(imageBox);
			sortImages();

			image.onload = function() {
				this.style.opacity = 1;
			}
		}
	}

	xhr.send();
}

function sortImages() {
	var sort_by_id = function(a, b) {
		let a_id = parseInt(a.getAttribute('image_id')), b_id = parseInt(a.getAttribute('image_id'));

		if (a_id < b_id)
			return 1;
		if (a_id > b_id)
			return -1;

		return 0;
	}

	var images = $('#images > .image-box').get();
	images.sort(sort_by_id);
}

function makeImagePublic(event) {
	var imageBox = event.path[4];
	var id = imageBox.getAttribute('image_id');

	// the user might have clicked on the `div`
	// and we are using `event.path` to manipulate data
	// so `id` can be `null`
	if (!id)
		return;

	var img = event.path[0];
	var value = imageBox.getAttribute('visibility') == 'public' ? 'private' : 'public';

	let json = JSON.stringify({
		id: id,
		value: value == 'public'
	});

	let xhr = new XMLHttpRequest();
	xhr.open('POST', '/api/image/make_public');

	xhr.onreadystatechange = function() {
		if (xhr.readyState == XMLHttpRequest.DONE) {
			if (xhr.status == 200) {
				imageBox.setAttribute('visibility', value);
				img.src = `/static/icons/${value}.png`;
				console.log(img);
			}
			else
			if (xhr.status == 403)
				alert(doNotOwnThisImageMessage);
			else
			if (xhr.status == 404)
				alert(invalidRequest);
			else
				alert('Check your network!');
		}
	};

	xhr.send(json);
}

function likeImage(event) {
	var imageBox = event.path[4];
	var id = imageBox.getAttribute('image_id');

	// the user might have clicked on the `div`
	// and we are using `event.path` to manipulate data
	// so `id` can be `null`
	if (!id)
		return;

	var likeButton = event.path[1];
	var likes = event.path[2].children[0];
	var value = !(likeButton.getAttribute('liked') == 'true');

	let json = JSON.stringify({
		id: id,
		value: value
	});

	let xhr = new XMLHttpRequest();
	xhr.open('POST', '/api/image/like');

	xhr.onreadystatechange = function() {
		if (xhr.readyState == XMLHttpRequest.DONE) {
			if (xhr.status == 200) {
				var json = JSON.parse(xhr.responseText);
				likeButton.setAttribute('liked', value);
				document.getElementById('numLikes').innerHTML=json.tlikes;

				if (value)
					likeButton.classList.add('dislike');
				else
					likeButton.classList.remove('dislike');

				likes.innerHTML = json.likes;
			}
			else
			if (xhr.status == 403)
				alert('You need to be logged in to like an image!');
			else
			if (xhr.status == 404)
				alert("Invalid request, refresh the page!");
			else
				alert('Check your network!');
		}
	};

	xhr.send(json);
}

function deleteImage(event) {
	var imageBox = event.path[4];
	var id = imageBox.getAttribute('image_id');

	// the user might have clicked on the `div`
	// and we are using `event.path` to manipulate data
	// so `id` can be `null`
	if (!id)
		return;

	let json = JSON.stringify({
		id: id,
	});

	let xhr = new XMLHttpRequest();
	xhr.open('POST', '/api/image/delete');

	xhr.onreadystatechange = function() {
		if (xhr.readyState == XMLHttpRequest.DONE) {
			if (xhr.status == 200) {
				var json=JSON.parse(xhr.responseText);
				imageBox.remove();
				document.getElementById('numLikes').innerHTML=json.tlikes;
				document.getElementById('numViews').innerHTML=json.tviews;

				var images = document.getElementById('images');
				var type = images.getAttribute('value');

				if (type == 'private') {
					var profileNavInfo = document.querySelector('#numPhotos');
					var numPhotos = images.children.length - 1; // -1 for the `<template>` child
					profileNavInfo.innerHTML = `You have uploaded ${numPhotos} photos`;
				}
			}
			else
			if (xhr.status == 403)
				alert(doNotOwnThisImageMessage);
			else
			if (xhr.status == 404)
				alert(invalidRequest);
			else
				alert('Check your network!');
		}
	};

	xhr.send(json);
}
