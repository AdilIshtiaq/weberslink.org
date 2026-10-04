(function () {
  if (typeof THREE === 'undefined') return;
  var canvas = document.getElementById('scene');
  var renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: window.devicePixelRatio < 2, alpha: true, powerPreference: 'low-power' }); }
  catch (err) { return; }
  var mobile = window.innerWidth < 860;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.25 : 1.75));
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(40, 1, .1, 100);
  camera.position.set(0, 0, 9);

  // Procedural chrome matcap (silver studio lighting)
  function matcap() {
    var c = document.createElement('canvas'); c.width = c.height = 256; var g = c.getContext('2d');
    var bg = g.createRadialGradient(100, 80, 10, 128, 128, 140);
    bg.addColorStop(0, '#ffffff'); bg.addColorStop(.25, '#d9dadd'); bg.addColorStop(.55, '#6e7075');
    bg.addColorStop(.8, '#1c1c1e'); bg.addColorStop(1, '#8a8c90');
    g.fillStyle = bg; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
    var rim = g.createLinearGradient(0, 180, 0, 256);
    rim.addColorStop(0, 'rgba(255,255,255,0)'); rim.addColorStop(1, 'rgba(230,230,235,.55)');
    g.fillStyle = rim; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
    return new THREE.CanvasTexture(c);
  }
  var chrome = new THREE.MeshMatcapMaterial({ matcap: matcap() });

  var group = new THREE.Group(); scene.add(group);
  var knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.25, .38, mobile ? 140 : 220, mobile ? 20 : 32, 2, 3), chrome);
  group.add(knot);
  var ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, .025, 8, 120), new THREE.MeshBasicMaterial({ color: 0x9a9ca1, transparent: true, opacity: .55 }));
  ring.rotation.x = 1.2; group.add(ring);
  var ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.1, .012, 8, 120), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .25 }));
  ring2.rotation.set(.4, .9, 0); group.add(ring2);
  var orbs = [];
  [[.32, 2.6, 0], [.18, 3.1, 2.1], [.22, 2.6, 4.2]].forEach(function (o) {
    var m = new THREE.Mesh(new THREE.SphereGeometry(o[0], 24, 24), chrome);
    m.userData = { r: o[1], a: o[2] }; group.add(m); orbs.push(m);
  });

  var N = mobile ? 500 : 1100, pos = new Float32Array(N * 3);
  for (var i = 0; i < N; i++) {
    var r = 5 + Math.random() * 9, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th); pos[i * 3 + 2] = r * Math.cos(ph) - 4;
  }
  var pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  var stars = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xd0d2d6, size: .03, transparent: true, opacity: .7 }));
  scene.add(stars);

  function layout() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    mobile = w < 860;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    group.position.set(mobile ? 1.2 : 3.3, mobile ? 2.6 : 0, 0);
    group.scale.setScalar(mobile ? .5 : .85);
    canvas.style.opacity = mobile ? .5 : 1;
  }
  window.addEventListener('resize', layout); layout();

  var mx = 0, my = 0, tx = 0, ty = 0, sy = 0;
  window.addEventListener('pointermove', function (e) { tx = e.clientX / window.innerWidth - .5; ty = e.clientY / window.innerHeight - .5; }, { passive: true });
  window.addEventListener('scroll', function () { sy = window.scrollY; }, { passive: true });

  // Only render while the hero is on screen and the tab is visible
  var onScreen = true, running = false, last = 0;
  new IntersectionObserver(function (e) { onScreen = e[0].isIntersecting; kick(); }).observe(canvas);
  document.addEventListener('visibilitychange', kick);

  var clock = new THREE.Clock(), T = 0;
  function frame(now) {
    if (!onScreen || document.hidden) { running = false; clock.stop(); return; }
    requestAnimationFrame(frame);
    if (mobile && now - last < 33) return; // ~30fps on phones
    last = now;
    T += Math.min(clock.getDelta(), .1); var t = T;
    mx += (tx - mx) * .05; my += (ty - my) * .05;
    knot.rotation.x = t * .18 + my * .6; knot.rotation.y = t * .26 + mx * .8;
    ring.rotation.z = t * .12; ring2.rotation.z = -t * .08;
    orbs.forEach(function (o, k) {
      var a = o.userData.a + t * (.35 + k * .07), r = o.userData.r;
      o.position.set(Math.cos(a) * r, Math.sin(a * 1.3) * .6, Math.sin(a) * r * .6);
    });
    group.rotation.y = mx * .35; group.rotation.x = my * .25;
    group.position.z = -sy * .004;
    stars.rotation.y = t * .015 + mx * .1; stars.rotation.x = my * .08;
    renderer.render(scene, camera);
  }
  function kick() { if (!running && onScreen && !document.hidden) { running = true; clock.start(); requestAnimationFrame(frame); } }
  kick();
})();
