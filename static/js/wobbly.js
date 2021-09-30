$(document).ready(() => {
	var wobblies = document.querySelectorAll('.wobbly-image-box');

	wobblies.forEach((wobbly) => {
		$(wobbly).mousemove((event) => {
			wobble(wobbly, event);
		});

		$(wobbly).mouseleave((event) => {
			stopWobbling(wobbly);
		});
	});
});

function wobble(wobbly, event) {
	var rect = wobbly.getBoundingClientRect();
	var mouseX = event.clientX, mouseY = event.clientY;

	var x = (rect.left + rect.right) / 2, y = (rect.top + rect.bottom) / 2;
	var width = rect.width, height = rect.height;

	var dX = constrain(mouseX - x, -width/2, width/2) / 4,
	dY = constrain(mouseY - y, -height/2, height/2) / 4;

	wobbly.style = `transform: translate(${dX}px, ${dY}px);`;
}

function stopWobbling(wobbly) {
	wobbly.style = "";
}

function constrain(t, min, max) {
	return Math.max(min, Math.min(max, t));
}
