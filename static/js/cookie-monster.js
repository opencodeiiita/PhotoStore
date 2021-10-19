$(document).ready(() => {
	let cookieMonster = $('#cookie-monster')[0];

	if (cookieMonster) {
		if (localStorage.cookieConsent === 'accepted') {
			cookieMonster.classList.add('disabled');
		}
		else {
			cookieMonster.classList.remove('disabled');
		}
	}

	$(cookieMonster)
		.on('click', acceptCookieMonster)
		.on('mousemove', grabHimCookieMonster)
		.on('mouseleave', stopCookieMonster_thatsEnough);
});

function acceptCookieMonster() {
	let cookiemonster = $('#cookie-monster')[0];
	localStorage.cookieConsent = 'accepted';
	cookiemonster.remove();
}

function grabHimCookieMonster(event) {
	let cmbutton = $('#cookie-monster-button')[0];
	let rect = cmbutton.getBoundingClientRect();
	let mouseX = event.clientX, mouseY = event.clientY;

	let x = (rect.left + rect.right) / 2, y = (rect.top + rect.bottom) / 2;
	let width = rect.width, height = rect.height;

	let dX = constrain(mouseX - x, -width/2, width/2) / 4,
	dY = constrain(mouseY - y, -height/2, height/2) / 4;

	cmbutton.style = `transform: translate(${dX}px, ${dY}px);`;
}

function stopCookieMonster_thatsEnough() {
	let cmbutton = $('#cookie-monster-button')[0].style = "";
}

function constrain(t, min, max) {
	return Math.max(min, Math.min(max, t));
}
