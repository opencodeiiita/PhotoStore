$(document).ready(() => {
	$('.close-button').on('click', (event) => {
		removeFlashMessage(event);
	});
});

function removeFlashMessage(event) {
	event.target.parentElement.remove();

	let flash = $('#flash')[0];

	if (flash.children.length === 0) {
		flash.remove();
	}
}
