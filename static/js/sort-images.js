$(document).ready(() => {
	function f(id) {
		var listItems = $(`#${id} li`);

		listItems.each((index, item) => {
			$(item).on('click', () => {
				if (item.classList.contains('selected'))
					return;

				var selectedItem = $(`#${id} li.selected`)[0];
				selectedItem.classList.remove('selected');

				item.classList.add('selected');
				$(`#${id} button`)[0].value = item.getAttribute('data-value');

				sortImages();
			});
		});
	}

	f('sort-by-field');
	f('sort-by-order');
});

function sortImages(lambda, order) {
        // lambda = (imageBox) => parseInt(imageBox.getAttribute('data-id'))
        // order  = 1 (ASC) or -1 (DESC)

        if (lambda === undefined) {
		var attribute = $('#sort-by-field button')[0].value;
		lambda = (imageBox) => parseInt(imageBox.getAttribute(attribute));
	}

	if (order === undefined) {
		order = parseInt($('#sort-by-order button')[0].value);
	}

        let comparator = function(a, b) {
                let a_id = order * lambda(a), b_id = order * lambda(b);

                if (a_id < b_id)
                        return -1;

                if (a_id > b_id)
                        return 1;

                return 0;
        }

        let images = $('#images')[0],
                imagesArray = Array.from(images.children);

        let sortedImages = imagesArray.sort(comparator);
        sortedImages.forEach(image => images.appendChild(image));
}
