const swiper = new Swiper('.swiper', {
    direction: 'vertical',
    loop: true,
    slidesPerView: 4,
    mousewheel: {},
    scrollbar: {
        el: '.swiper-scrollbar',
        draggable: true,
        snapOnRelease: true,
    },
    keyboard: {
        enabled: true,
    }
});