document.addEventListener('DOMContentLoaded', () => {
    const likeButtons = document.querySelectorAll('.like-button');

    likeButtons.forEach(button => {
        console.log('Button HTML:', button.innerHTML); // Log button HTML to verify its structure

        button.addEventListener('click', async (event) => {
            event.preventDefault();

            const postId = button.getAttribute('data-post-id'); // Get post ID
            const icon = button.querySelector('.fa-thumbs-up'); // Get the like icon inside the button
            const likeCountElement = button.closest('.post').querySelector('#like-count'); // Find the like count element for the current post

            if (!icon) {
                console.error('Icon element not found inside the button');
                return;
            }

            const isLiked = icon.classList.contains('icon-blue'); // Check if already liked

            try {
                const response = await fetch(`/like/${postId}`, {
                    method: isLiked ? 'DELETE' : 'POST', // POST if not liked, DELETE if already liked
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include' // Include cookies in request
                });

                if (response.ok) {
                    const data = await response.json(); // Parse response
                    // Update the icon's appearance based on the like/unlike status
                    if (isLiked) {
                        icon.classList.remove('icon-blue');
                        icon.classList.add('icon-white');
                    } else {
                        icon.classList.remove('icon-white');
                        icon.classList.add('icon-blue');
                    }
                    console.log(data);

                    // Update the like count element with the new like count from the server
                    likeCountElement.textContent = `Likes: ${data.likes}`;

                } else {
                    console.error('Failed to update like status');
                }
            } catch (error) {
                console.error('Error:', error);
            }
        });
    });
});


document.addEventListener('DOMContentLoaded', () => {
    const deleteButtons = document.querySelectorAll('.delete-button');

    deleteButtons.forEach(button => {
        button.addEventListener('click', async (event) => {
            event.preventDefault();

            const postId = button.getAttribute('data-post-id');

            try {
                const response = await fetch(`/delete/${postId}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include' // include cookies if needed
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log(data);
                    // Remove the post from the DOM
                    button.closest('.post').remove();
                } else {
                    console.error('Failed to delete post');
                }
            } catch (error) {
                console.error('Error deleting post:', error);
            }
        });
    });
});

