document.addEventListener('DOMContentLoaded', function () {
  const galleries = document.querySelectorAll('[data-demo-gallery]')

  galleries.forEach(function (gallery) {
    const mainImage = gallery.querySelector('[data-demo-main-image]')
    const caption = gallery.querySelector('[data-demo-caption]')
    const buttons = gallery.querySelectorAll('[data-demo-src]')

    if (!mainImage || buttons.length === 0) return

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        const nextSrc = button.getAttribute('data-demo-src')
        const nextAlt = button.getAttribute('data-demo-alt') || mainImage.alt
        const nextCaption = button.getAttribute('data-demo-caption') || ''

        if (!nextSrc) return

        mainImage.src = nextSrc
        mainImage.alt = nextAlt

        if (caption) {
          caption.textContent = nextCaption
        }

        buttons.forEach(function (item) {
          item.classList.remove('is-active')
        })

        button.classList.add('is-active')
      })
    })
  })
})