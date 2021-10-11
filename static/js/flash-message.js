function removeFlashMessage(event) {
	event.target.parentElement.remove();

	let flash = document.getElementById('flash');
	if (flash.children.length === 0) {
		flash.remove();
	}
}
