(function () {
  var track = document.getElementById('home-track');
  var toy = document.getElementById('toy');
  var view = document.getElementById('toy-view');
  if (!track || !toy || !view) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function place(progress) {
    var narrow = window.innerWidth <= 700;
    var travel = narrow ? 18 : 36;
    var lift = Math.sin(progress * Math.PI) * (narrow ? 4 : 8);
    toy.style.transform = 'translate3d(' + (-progress * travel) + 'vw, ' + (-lift) + 'vh, 0)';
    view.orientation = '8deg ' + (progress * 360) + 'deg ' + (progress * -22) + 'deg';
  }

  if (reduce) {
    place(0.15);
    return;
  }

  var scheduled = false;
  function update() {
    scheduled = false;
    var span = Math.max(1, track.offsetHeight - window.innerHeight);
    var progress = Math.min(1, Math.max(0, -track.getBoundingClientRect().top / span));
    place(progress);
  }
  function onScroll() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(update);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
})();
