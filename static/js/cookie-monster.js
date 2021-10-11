$(document).ready(() => {
	let cookiemonster = document.getElementById('cookie-monster');

	if (cookiemonster) {
		if (localStorage.cookieConsent === 'accepted') {
			cookiemonster.classList.add('disabled');
		}
		else {
			cookiemonster.classList.remove('disabled');
		}
	}
});

function acceptCookieMonster() {
	let cookiemonster = document.getElementById('cookie-monster');
	localStorage.cookieConsent = 'accepted';
	cookiemonster.remove();
}

function grabHimCookieMonster(event) {
	let cmbutton = document.getElementById('cookie-monster-button');
	let rect = cmbutton.getBoundingClientRect();
	let mouseX = event.clientX, mouseY = event.clientY;

	let x = (rect.left + rect.right) / 2, y = (rect.top + rect.bottom) / 2;
	let width = rect.width, height = rect.height;

	let dX = constrain(mouseX - x, -width/2, width/2) / 4,
	dY = constrain(mouseY - y, -height/2, height/2) / 4;

	cmbutton.style = `transform: translate(${dX}px, ${dY}px);`;
}

function stopCookieMonster_thatsEnough() {
	let cmbutton = document.getElementById('cookie-monster-button').style = "";
}

function constrain(t, min, max) {
	return Math.max(min, Math.min(max, t));
}
