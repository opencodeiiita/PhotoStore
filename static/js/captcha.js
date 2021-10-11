$(document).ready(loadCaptcha);

function loadCaptcha() {
	let captchaReload = document.getElementById('captcha-reload');
	if (captchaReload.classList.contains('loading'))
		return;

	captchaReload.classList.add('loading');

	let xhr = new XMLHttpRequest();

	xhr.open('GET', '/api/captcha');
	xhr.onreadystatechange = function() {
		if (xhr.readyState === XMLHttpRequest.DONE) {
			let captcha = JSON.parse(xhr.responseText);

			let captchaImage = document.getElementById('captcha-image');
			captchaImage.src = `data:image/png;base64,${captcha.b64}`;

			let captchaJWT = document.getElementById('captcha-jwt');
			captchaJWT.value = captcha.jwt;

			let captchaReload = document.getElementById('captcha-reload');
			captchaReload.classList.remove('loading');
		}
	};

	xhr.send();
}
