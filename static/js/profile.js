$(document).ready(() => {
	$('#profile-image').on('click', () => {
		$('#avatarChange').trigger('click');
	});

	$('#avatarChange').on('change', () => {
		$('#avatarForm').submit();
	});
});
