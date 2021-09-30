$(document).ready(loadCaptcha);

function loadCaptcha() {
	var captchaReload = document.getElementById('captcha-reload');
	if (captchaReload.classList.contains('loading'))
		return;

	captchaReload.classList.add('loading');

	var xhr = new XMLHttpRequest();

	xhr.open('GET', '/api/captcha');
	xhr.onreadystatechange = function() {
		if (xhr.readyState == XMLHttpRequest.DONE) {
			var captcha = JSON.parse(xhr.responseText);

			var captchaImage = document.getElementById('captcha-image');
			captchaImage.src = `data:image/png;base64,${captcha.b64}`;

			var captchaJWT = document.getElementById('captcha-jwt');
			captchaJWT.value = captcha.jwt;

			var captchaReload = document.getElementById('captcha-reload');
			captchaReload.classList.remove('loading');
		}
	};

	xhr.send();
}
