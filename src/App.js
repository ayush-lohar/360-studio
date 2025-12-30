import React, { useState, useRef, useEffect } from 'react';
import { Upload, Plus, RotateCw, Smartphone, X } from 'lucide-react';
import * as THREE from 'three';

export default function PanoramicViewer() {
  const [currentPano, setCurrentPano] = useState(null);
  const [hotspots, setHotspots] = useState([]);
  const [isAddingHotspot, setIsAddingHotspot] = useState(false);
  const [editingHotspot, setEditingHotspot] = useState(null);
  const [fov, setFov] = useState(75);
  const [hoveredHotspot, setHoveredHotspot] = useState(null);
  const [isGyroEnabled, setIsGyroEnabled] = useState(false);

  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const sphereRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const hotspotMeshesRef = useRef([]);
  
  // Interaction Refs
  const isDraggingRef = useRef(false);
  const lastInteractionTimeRef = useRef(Date.now());
  const previousPositionRef = useRef({ x: 0, y: 0 });
  const initialPinchDistanceRef = useRef(null);
  const targetRotationRef = useRef({ x: 0, y: 0 });
  const currentRotationRef = useRef({ x: 0, y: 0 });
  const gyroOffsetRef = useRef({ x: 0, y: 0 });

  // 1. Gyroscope Permission (Required for iOS & modern Android)
  const enableGyro = async () => {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission === 'granted') {
          setIsGyroEnabled(true);
          window.addEventListener('deviceorientation', handleDeviceMove);
        }
      } catch (err) {
        alert("Gyroscope access denied or not supported.");
      }
    } else {
      setIsGyroEnabled(true);
      window.addEventListener('deviceorientation', handleDeviceMove);
    }
  };

  const handleDeviceMove = (e) => {
    if (!e.beta || !e.gamma) return;
    // Mobile rotation logic (Beta = X-axis, Gamma = Y-axis)
    gyroOffsetRef.current.x = (e.beta - 90) * (Math.PI / 180) * 0.5;
    gyroOffsetRef.current.y = e.gamma * (Math.PI / 180) * 0.5;
  };

  // 2. Scene Setup
  useEffect(() => {
    if (!containerRef.current || !currentPano) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(fov, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 0.1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    containerRef.current.appendChild(renderer.domElement);

    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1);
    const texture = new THREE.TextureLoader().load(currentPano.url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
    });
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    sphereRef.current = sphere;

    const animate = () => {
      const id = requestAnimationFrame(animate);
      
      // Interpolate for smooth movement
      currentRotationRef.current.x += (targetRotationRef.current.x - currentRotationRef.current.x) * 0.15;
      currentRotationRef.current.y += (targetRotationRef.current.y - currentRotationRef.current.y) * 0.15;
      
      camera.rotation.order = 'YXZ';
      camera.rotation.x = currentRotationRef.current.x + gyroOffsetRef.current.x;
      camera.rotation.y = currentRotationRef.current.y + gyroOffsetRef.current.y;

      // Auto-rotate if idle (only if gyro is off)
      if (Date.now() - lastInteractionTimeRef.current > 3000 && !isDraggingRef.current && !isGyroEnabled) {
        targetRotationRef.current.y += 0.001;
      }

      hotspotMeshesRef.current.forEach(mesh => {
        const s = 15 + Math.sin(Date.now() * 0.005) * 3;
        mesh.scale.set(s, s, s);
        mesh.lookAt(camera.position);
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animate);
      if (containerRef.current) containerRef.current.innerHTML = '';
      window.removeEventListener('deviceorientation', handleDeviceMove);
    };
  }, [currentPano]);

  // 3. Resize Handler
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 4. Interaction (Mouse + Touch)
  useEffect(() => {
    if (!rendererRef.current) return;
    const canvas = rendererRef.current.domElement;

    const getDistance = (t1, t2) => Math.hypot(t1.pageX - t2.pageX, t1.pageY - t2.pageY);

    const updateFov = (delta) => {
      setFov(prev => {
        const newFov = Math.max(30, Math.min(100, prev + delta));
        if (cameraRef.current) {
          cameraRef.current.fov = newFov;
          cameraRef.current.updateProjectionMatrix();
        }
        return newFov;
      });
    };

    const handlePointerStart = (x, y, isTouch = false, e = null) => {
      isDraggingRef.current = true;
      lastInteractionTimeRef.current = Date.now();
      previousPositionRef.current = { x, y };

      if (isAddingHotspot) {
        const rect = canvas.getBoundingClientRect();
        const coords = {
          x: ((x - rect.left) / rect.width) * 2 - 1,
          y: -((y - rect.top) / rect.height) * 2 + 1
        };
        raycasterRef.current.setFromCamera(coords, cameraRef.current);
        const intersects = raycasterRef.current.intersectObject(sphereRef.current);
        if (intersects.length > 0) {
          const point = intersects[0].point.clone().normalize().multiplyScalar(450);
          const newHotspot = { id: Date.now(), pos: point, label: '' };
          setHotspots(prev => [...prev, newHotspot]);
          setEditingHotspot(newHotspot);
          setIsAddingHotspot(false);
        }
      }
    };

    const handlePointerMove = (x, y, isTouch = false) => {
      lastInteractionTimeRef.current = Date.now();
      if (isDraggingRef.current) {
        const deltaX = x - previousPositionRef.current.x;
        const deltaY = y - previousPositionRef.current.y;
        targetRotationRef.current.y += deltaX * (isTouch ? 0.005 : 0.003);
        targetRotationRef.current.x += deltaY * (isTouch ? 0.005 : 0.003);
        targetRotationRef.current.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, targetRotationRef.current.x));
        previousPositionRef.current = { x, y };
      }
    };

    // Desktop Events
    const onMouseDown = (e) => handlePointerStart(e.clientX, e.clientY);
    const onMouseMove = (e) => handlePointerMove(e.clientX, e.clientY);
    const onMouseUp = () => isDraggingRef.current = false;
    const onWheel = (e) => { e.preventDefault(); updateFov(e.deltaY * 0.05); };

    // Mobile Events
    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        initialPinchDistanceRef.current = getDistance(e.touches[0], e.touches[1]);
      } else {
        handlePointerStart(e.touches[0].clientX, e.touches[0].clientY, true);
      }
    };

    const onTouchMove = (e) => {
      if (e.touches.length === 2 && initialPinchDistanceRef.current) {
        const dist = getDistance(e.touches[0], e.touches[1]);
        const delta = (initialPinchDistanceRef.current - dist) * 0.1;
        updateFov(delta);
        initialPinchDistanceRef.current = dist;
      } else {
        handlePointerMove(e.touches[0].clientX, e.touches[0].clientY, true);
      }
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchend', onMouseUp);

    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchend', onMouseUp);
    };
  }, [isAddingHotspot, hotspots]);

  // 5. Hotspot Rendering
  useEffect(() => {
    if (!sceneRef.current) return;
    hotspotMeshesRef.current.forEach(m => sceneRef.current.remove(m));
    hotspotMeshesRef.current = [];

    hotspots.forEach(h => {
      const geo = new THREE.CircleGeometry(1, 32);
      const mat = new THREE.MeshBasicMaterial({ 
        color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(h.pos.x, h.pos.y, h.pos.z);
      sceneRef.current.add(mesh);
      hotspotMeshesRef.current.push(mesh);
    });
  }, [hotspots]);

  return (
    <div className="h-screen w-full bg-black flex flex-col overflow-hidden fixed inset-0 font-sans">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4 flex items-center justify-between z-30">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <RotateCw size={20} className="text-blue-400" /> 
          <span className="tracking-tight uppercase">360° Sphere</span>
        </h1>
        
        <div className="flex gap-2">
          <button 
            onClick={enableGyro}
            className={`p-2.5 rounded-full backdrop-blur-md border transition-all ${isGyroEnabled ? 'bg-blue-600 border-blue-400 text-white' : 'bg-white/10 border-white/20 text-gray-300'}`}
          >
            <Smartphone size={20} />
          </button>
          
          <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-full flex items-center gap-2 transition-all shadow-lg text-sm font-bold">
            <Upload size={16} /> <span className="hidden sm:inline">Upload Pano</span>
            <input type="file" hidden accept="image/*" onChange={(e) => {
              const file = e.target.files[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => { setCurrentPano({ id: Date.now(), url: ev.target.result }); setHotspots([]); };
                reader.readAsDataURL(file);
              }
            }} />
          </label>
        </div>
      </div>

      {/* Main Viewport */}
      <main className="flex-1 relative touch-none select-none">
        {!currentPano ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-4">
              <Upload size={32} className="text-gray-600" />
            </div>
            <h2 className="text-white text-xl font-medium mb-2">No Panorama Loaded</h2>
            <p className="text-gray-500 max-w-xs">Upload a 360° equirectangular image to start your virtual tour.</p>
          </div>
        ) : (
          <div className="w-full h-full">
            <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
            
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-3 w-full px-4">
              {isAddingHotspot && (
                <div className="bg-orange-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-xl animate-pulse">
                  TAP ON SCREEN TO PLACE
                </div>
              )}
              <button 
                onClick={() => setIsAddingHotspot(!isAddingHotspot)} 
                className={`w-full max-w-[200px] flex items-center justify-center gap-2 py-4 rounded-2xl font-bold shadow-2xl transition-all ${
                  isAddingHotspot ? 'bg-red-500 scale-95' : 'bg-white text-black hover:bg-gray-100'
                }`}
              >
                {isAddingHotspot ? <X size={20}/> : <Plus size={20}/>}
                {isAddingHotspot ? 'Cancel' : 'Add Hotspot'}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Friendly Modal */}
      {editingHotspot && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-end sm:items-center justify-center z-[100]">
          <div className="bg-gray-900 p-6 rounded-t-3xl sm:rounded-3xl w-full max-w-sm border-t sm:border border-gray-800">
            <div className="w-12 h-1 bg-gray-700 rounded-full mx-auto mb-6 sm:hidden" />
            <h3 className="text-white text-lg font-bold mb-4">Name this Spot</h3>
            <input 
              autoFocus
              className="w-full bg-gray-800 text-white p-4 rounded-xl mb-6 outline-none border border-gray-700 focus:border-blue-500 text-lg" 
              placeholder="e.g. Master Bedroom" 
              value={editingHotspot.label}
              onChange={e => setEditingHotspot({...editingHotspot, label: e.target.value})}
            />
            <button 
              className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-transform"
              onClick={() => setEditingHotspot(null)}
            >
              Save Hotspot
            </button>
          </div>
        </div>
      )}
    </div>
  );
}