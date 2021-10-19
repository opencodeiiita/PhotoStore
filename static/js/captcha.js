$(document).ready(() => {
	$('#captcha-reload').on('click', loadCaptcha);
	loadCaptcha();
});

function loadCaptcha() {
	let captchaReload = $('#captcha-reload')[0];

	if (captchaReload.classList.contains('loading'))
		return;

	captchaReload.classList.add('loading');

	let xhr = new XMLHttpRequest();

	xhr.open('GET', '/api/captcha');
	xhr.onreadystatechange = function() {
		if (xhr.readyState === XMLHttpRequest.DONE) {
			let captcha = JSON.parse(xhr.responseText);

			let captchaImage = $('#captcha-image')[0];
			captchaImage.src = `data:image/png;base64,${captcha.b64}`;

			let captchaJWT = $('#captcha-jwt')[0];
			captchaJWT.value = captcha.jwt;

			captchaReload.classList.remove('loading');
		}
	};

	xhr.send();
}
