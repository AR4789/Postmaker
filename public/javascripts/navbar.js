// document.getElementById('menuToggle').addEventListener('click', function () {
//     const navbarContent = document.getElementById('navbarContent');
//     navbarContent.classList.toggle('hidden');
// });


const menuToggle = document.getElementById('menuToggle');
const navbarContent = document.getElementById('navbarContent');

menuToggle.addEventListener('click', () => {
    navbarContent.classList.toggle('hidden');
});