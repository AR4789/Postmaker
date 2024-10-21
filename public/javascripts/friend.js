document.querySelectorAll('.delete-friend-button').forEach(button => {
    button.addEventListener('click', async event => {
        event.preventDefault();
        const friendId = button.getAttribute('data-friend-id');
        try {
            const response = await fetch(`/delete-friend/${friendId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            if (response.ok) {
                // Remove the friend card from the DOM
                button.parentNode.parentNode.remove();
            } else {
                console.error('Failed to delete friend');
            }
        } catch (error) {
            console.error('Error:', error);
        }
    });
});