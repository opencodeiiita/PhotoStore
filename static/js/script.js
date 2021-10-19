$(document).ready(() => {
	$('#logo-text').on('click', () => {
		window.location.href = '/';
	});

	$('#username').on('input', function() {
		this.value = this.value.replace(/[^0-9A-Z_]+/gi, '');
	});
});
