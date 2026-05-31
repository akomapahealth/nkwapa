(function () {
  function syncButton(input, button, openIcon, offIcon) {
    var visible = input.type === 'text';

    button.setAttribute('aria-pressed', visible ? 'true' : 'false');
    button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');

    if (openIcon) {
      openIcon.hidden = visible;
    }

    if (offIcon) {
      offIcon.hidden = !visible;
    }
  }

  function connectToggle(button) {
    var targetId = button.getAttribute('data-password-toggle-target');
    var input = targetId ? document.getElementById(targetId) : null;

    if (!input) {
      return;
    }

    var openIcon = button.querySelector('.nkwapa-icon-eye--open');
    var offIcon = button.querySelector('.nkwapa-icon-eye--off');

    button.addEventListener('click', function () {
      input.type = input.type === 'password' ? 'text' : 'password';
      syncButton(input, button, openIcon, offIcon);
    });

    syncButton(input, button, openIcon, offIcon);
  }

  function init() {
    var buttons = document.querySelectorAll('[data-password-toggle-target]');

    for (var index = 0; index < buttons.length; index += 1) {
      connectToggle(buttons[index]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
