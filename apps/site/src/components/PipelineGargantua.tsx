import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** Slightly trimmed from the original 550 to keep the homepage demo smoother. */
const RAYMARCH_STEPS = 500;

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform mat4 u_cameraWorldMatrix;
  uniform mat4 u_cameraProjectionMatrixInverse;
  varying vec2 vUv;
  #define STEPS ${RAYMARCH_STEPS}
  #define RS 0.4
  #define G_STRENGTH(r) (14.0 * exp(-r * 0.05))
  #define DISK_INNER 1.8
  #define DISK_OUTER 32.0
  #define SHIP_RADIUS 17.5
  #define SHIP_RING_SIZE 0.15
  #define SHIP_POD_SIZE 0.09
  #define SHIP_SPEED -0.2
  #define SHIP_HEIGHT 0.5
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }
  float noise3D(vec3 x) {
    vec3 p = floor(x); vec3 f = fract(x);
    f = f*f*(3.0-2.0*f);
    float n = p.x + p.y*57.0 + 113.0*p.z;
    return mix(mix(mix(fract(sin(n+0.0)*43758.5), fract(sin(n+1.0)*43758.5),f.x),
                   mix(fract(sin(n+57.0)*43758.5), fract(sin(n+58.0)*43758.5),f.x),f.y),
               mix(mix(fract(sin(n+113.0)*43758.5), fract(sin(n+114.0)*43758.5),f.x),
                   mix(fract(sin(n+170.0)*43758.5), fract(sin(n+171.0)*43758.5),f.x),f.y),f.z);
  }
  float fbm(vec3 p) {
    float f = 0.0;
    f += 0.500 * noise3D(p); p *= 2.02;
    f += 0.250 * noise3D(p); p *= 2.03;
    f += 0.125 * noise3D(p);
    return f;
  }
  mat3 rotationMatrix(vec3 axis, float angle) {
    float s = sin(angle); float c = cos(angle); float oc = 1.0 - c;
    return mat3(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,
                oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,
                oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c);
  }
  vec3 hex(int c) {
    return vec3(float((c>>16)&0xff)/255.0, float((c>>8)&0xff)/255.0, float(c&0xff)/255.0);
  }
  float getSuspendedParticles(vec3 p, float r) {
    if (r < DISK_INNER || r > DISK_OUTER * 0.8) return 0.0;

    float diskLayer = smoothstep(0.7, 0.0, abs(p.y));
    if (diskLayer <= 0.0) return 0.0;
    float densityMask = smoothstep(DISK_OUTER * 0.85, DISK_INNER, r) * 0.8;
    densityMask *= (0.4 + 0.6 * noise3D(p * 0.5));
    float angle = atan(p.z, p.x) + u_time * (1.2 / sqrt(r));
    vec3 pRot = vec3(r * 2.0, p.y * 12.0, angle * 18.0);

    float pNoise = pow(noise3D(pRot * 1.8), 17.5) * 88.0;
    pNoise += pow(noise3D(pRot * 4.0 + u_time * 0.1), 27.0) * 128.0;

    return pNoise * diskLayer * densityMask;
  }
  vec3 getParticleColor(float r, vec2 uv, vec3 p) {
    float seed = hash(floor(p.xz * 5.0) + floor(p.y * 10.0));

    vec3 cPaleBlue = hex(0xA8C0E0);
    vec3 cPalePink = hex(0xE0B8B8);
    vec3 cPaleWhite = hex(0xF0F0F0);

    if (seed < 0.4) return cPaleBlue;
    if (seed < 0.7) return cPalePink;
    return cPaleWhite;
  }
  vec3 getDiskColor(float r, float doppler) {
    float t = clamp((r - DISK_INNER) / (DISK_OUTER - DISK_INNER), 0.0, 1.0);

    vec3 cHorizon = hex(0xF9FCFF);
    vec3 cGlacierTransition = hex(0xD0E3FF);
    vec3 cMainBlue = hex(0x7096D1);
    vec3 cMidTransition = hex(0x334EAC);
    vec3 cEdgeGreen = hex(0x08FF5C);

    vec3 col;
    if (t < 0.1) {
      col = mix(cHorizon, cGlacierTransition, smoothstep(0.0, 0.1, t));
    } else if (t < 0.3) {
      col = mix(cGlacierTransition, cMainBlue, smoothstep(0.1, 0.3, t));
    } else if (t < 0.7) {
      col = mix(cMainBlue, cMidTransition, smoothstep(0.3, 0.7, t));
    } else {
      col = mix(cMidTransition, cEdgeGreen, smoothstep(0.7, 1.0, t));
    }
    float falloff = pow(1.0 - t, 1.8);
    float edgeGlow = exp(-pow(r - DISK_INNER, 2.0) * 8.0) * 1.5;

    return (col + edgeGlow) * pow(1.1 + doppler * 0.45, 2.5) * falloff;
  }
  vec3 getShipColor(vec3 p, float transmittance) {
    float angle_orbit = u_time * SHIP_SPEED;
    vec3 shipCenter = vec3(cos(angle_orbit) * SHIP_RADIUS, SHIP_HEIGHT, sin(angle_orbit) * SHIP_RADIUS);

    vec3 relP = p - shipCenter;
    float dCenter = length(relP);
    if (dCenter > SHIP_RING_SIZE + 0.5) return vec3(0.0);

    vec3 shipCol = vec3(0.0);
    vec3 toBlackHole = normalize(-shipCenter);
    for(int i=0; i<12; i++) {
      float angle_pod = float(i) * 0.5236;
      vec3 podOffset = vec3(cos(angle_pod) * SHIP_RING_SIZE, sin(angle_pod) * SHIP_RING_SIZE, 0.0);
      vec3 forward = normalize(vec3(-shipCenter.z, 0.0, shipCenter.x));
      vec3 up = vec3(0.0, 1.0, 0.0);
      vec3 right = cross(forward, up);
      vec3 podPos = podOffset.x * right + podOffset.y * up;
      float dPod = length(relP - podPos);
      if (dPod < SHIP_POD_SIZE * 2.0) {
        float coreGlow = 0.00015 / (dPod * dPod + 0.0002);
        vec3 podNormal = normalize(relP - podPos);
        float bounceLight = max(0.0, -podNormal.y) * 0.6;
        float shadow = mix(0.1, 1.3, pow(max(0.0, dot(podNormal, toBlackHole) * 0.5 + 0.5), 1.2));
        float body = smoothstep(SHIP_POD_SIZE, SHIP_POD_SIZE * 0.1, dPod) * (0.6 * shadow + bounceLight);
        shipCol += (vec3(0.75, 0.95, 1.0) * coreGlow + vec3(0.55, 0.6, 0.65) * body);
      }
    }
    return shipCol * transmittance;
  }
  void main() {
    vec2 uv = (vUv - 0.5) * 2.0;
    uv.x *= u_resolution.x / u_resolution.y;
    vec4 target = u_cameraProjectionMatrixInverse * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
    vec3 rayDir = normalize((u_cameraWorldMatrix * vec4(target.xyz, 0.0)).xyz);
    vec3 rayPos = (u_cameraWorldMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    mat3 tilt = rotationMatrix(vec3(0.0, 0.0, 1.0), 0.25) * rotationMatrix(vec3(1.0, 0.0, 0.0), 0.15);
    rayPos = tilt * rayPos;
    rayDir = tilt * rayDir;
    vec3 p = rayPos;
    vec3 v = rayDir;
    vec3 finalCol = vec3(0.0);
    float transmittance = 1.0;

    float dither = hash(vUv + u_time * 0.01);
    float dt = 0.1;
    p += v * dither * dt;
    float prevH = p.y;
    for(int i = 0; i < STEPS; i++) {
      float r = length(p);
      if (r < RS * 1.01) {
        transmittance = 0.0;
        break;
      }
      vec3 accel = -2.5 * RS * p / pow(r, 4.0) * G_STRENGTH(r);
      v = normalize(v + accel * dt);
      p += v * dt;
      float particleAmount = getSuspendedParticles(p, r);
      if(particleAmount > 0.0) {
        vec3 pCol = getParticleColor(r, vUv, p);
        finalCol += pCol * particleAmount * transmittance * 0.0061;
      }
      vec3 ship = getShipColor(p, transmittance);
      finalCol += ship;

      if (prevH * p.y < 0.0) {
        float t_hit = abs(prevH) / (abs(prevH) + abs(p.y));
        vec3 p_hit = mix(p - v * dt, p, t_hit);
        float r_hit = length(p_hit);
        if (r_hit > DISK_INNER && r_hit < DISK_OUTER) {
          float speed = 0.5 / sqrt(r_hit);
          float angle = u_time * speed;
          float s = sin(angle); float c = cos(angle);
          vec3 nPos = vec3(p_hit.x * c - p_hit.z * s, 0.0, p_hit.x * s + p_hit.z * c);

          float n = fbm(nPos * 1.1 + u_time * 0.04);
          float alpha = n * 0.85 * smoothstep(DISK_INNER, DISK_INNER+0.3, r_hit) * (1.0 - smoothstep(DISK_OUTER-3.0, DISK_OUTER, r_hit));

          vec3 vel = normalize(vec3(-p_hit.z, 0.0, p_hit.x));
          float doppler = dot(v, vel);
          vec3 diskCol = getDiskColor(r_hit, doppler);
          finalCol += transmittance * diskCol * alpha;
          transmittance *= (1.0 - alpha * 0.85);
        }
      }
      prevH = p.y;
      dt = 0.04 + 0.4 * smoothstep(1.5, 40.0, r);

      if (r > 85.0) {
        vec3 starCoord = v * 320.0;
        float starSeed = hash(floor(starCoord.xy + starCoord.z));
        float stars = pow(noise3D(starCoord), 52.0) * 1.1;
        float twinkle = mix(0.3, 1.0, sin(u_time * (2.0 + starSeed * 4.0) + starSeed * 10.0) * 0.5 + 0.5);
        finalCol += transmittance * vec3(stars * 0.78, stars * 0.88, stars * 1.02) * twinkle;
        break;
      }
      if (transmittance < 0.01) break;
    }
    finalCol = 1.0 - exp(-finalCol * 2.0);
    gl_FragColor = vec4(finalCol, 1.0);
  }
`;

type PipelineGargantuaProps = {
  className?: string;
};

function getPixelRatioCap(): number {
  if (typeof window === 'undefined') return 1;
  const dpr = window.devicePixelRatio || 1;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  if (saveData || coarse) return Math.min(dpr, 1);
  // Match typical crispness on Retina; cap avoids extreme mobile/webview DPR blow-ups.
  return Math.min(dpr, 1.75);
}

/** Same vertical inset idea as IntersectionObserver rootMargin — keep logic in one place. */
const VIEWPORT_PLAY_MARGIN_FRAC = 0.12;

function isInPlayRegion(el: HTMLElement, marginFrac: number = VIEWPORT_PLAY_MARGIN_FRAC): boolean {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight || 0;
  if (r.width <= 0 || r.height <= 0) return false;
  const m = vh * marginFrac;
  return r.bottom > m && r.top < vh - m;
}

export default function PipelineGargantua({ className }: PipelineGargantuaProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      // Prefer the stronger GPU on dual-GPU machines; we already stop rendering off-screen.
      powerPreference: 'default',
      stencil: false,
      depth: false,
    });
    renderer.setPixelRatio(getPixelRatioCap());
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    renderer.setClearColor(0x000000, 1);
    container.appendChild(renderer.domElement);
    renderer.clear();

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 300);
    camera.position.set(0, 12, 65);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.045;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.22;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const uniforms = {
      u_time: { value: 0 },
      u_resolution: { value: new THREE.Vector2(1, 1) },
      u_cameraWorldMatrix: { value: camera.matrixWorld.clone() },
      u_cameraProjectionMatrixInverse: { value: camera.projectionMatrixInverse.clone() },
    };
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    const postScene = new THREE.Scene();
    postScene.add(mesh);
    const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const clock = new THREE.Clock(false);
    let animationId = 0;
    let running = false;

    const setSize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w < 2 || h < 2) return;
      renderer.setPixelRatio(getPixelRatioCap());
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      uniforms.u_resolution.value.set(w, h);
    };

    setSize();
    const ro = new ResizeObserver(() => setSize());
    ro.observe(container);

    const renderFrame = () => {
      controls.update();
      uniforms.u_time.value = clock.getElapsedTime();
      camera.updateMatrixWorld();
      uniforms.u_cameraWorldMatrix.value.copy(camera.matrixWorld);
      uniforms.u_cameraProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
      renderer.render(postScene, orthoCamera);
    };

    const loop = () => {
      if (!running || document.visibilityState === 'hidden') {
        animationId = 0;
        return;
      }
      renderFrame();
      animationId = requestAnimationFrame(loop);
    };

    const start = () => {
      if (running) return;
      if (reducedMotion.matches) return;
      running = true;
      clock.start();
      if (animationId) cancelAnimationFrame(animationId);
      animationId = requestAnimationFrame(loop);
    };

    const stop = () => {
      if (!running) return;
      running = false;
      clock.stop();
      cancelAnimationFrame(animationId);
      animationId = 0;
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
    };

    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.some((e) => e.isIntersecting && e.intersectionRatio > 0.02);
        if (vis) start();
        else stop();
      },
      {
        root: null,
        // Negative top/bottom: must be more "in view" than a sliver at the edge — less GPU
        // work while the user is just scrolling past, fewer jank spikes near the section.
        rootMargin: '-12% 0px -12% 0px',
        threshold: [0, 0.02, 0.1, 0.25],
      },
    );
    io.observe(container);

    requestAnimationFrame(() => {
      if (isInPlayRegion(container) && !reducedMotion.matches) start();
    });

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
        return;
      }
      if (isInPlayRegion(container) && !reducedMotion.matches) start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onMotionChange = () => {
      if (reducedMotion.matches) stop();
    };
    reducedMotion.addEventListener('change', onMotionChange);

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion.removeEventListener('change', onMotionChange);
      controls.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      className={className}
      ref={containerRef}
      style={{ contain: 'layout paint', isolation: 'isolate' }}
      role="img"
      aria-label="Ray-marched accretion disk visualization — drag to orbit the camera"
    />
  );
}
