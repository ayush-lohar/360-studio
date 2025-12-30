import React, { useState, useRef, useEffect } from 'react';
import { Upload, Plus, Edit2, Trash2, X, RotateCw, Menu, ChevronLeft } from 'lucide-react';
import * as THREE from 'three';

export default function PanoramicViewer() {
  const [currentPano, setCurrentPano] = useState(null);
  const [hotspots, setHotspots] = useState([]);
  const [isAddingHotspot, setIsAddingHotspot] = useState(false);
  const [editingHotspot, setEditingHotspot] = useState(null);
  const [fov, setFov] = useState(75);
  const [hoveredHotspot, setHoveredHotspot] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Sidebar toggle state

  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const sphereRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const hotspotMeshesRef = useRef([]);
  const isDraggingRef = useRef(false);
  const lastInteractionTimeRef = useRef(Date.now());
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const animationIdRef = useRef(null);
  const targetRotationRef = useRef({ x: 0, y: 0 });
  const currentRotationRef = useRef({ x: 0, y: 0 });

  // Scene Setup with Resize Handling
  useEffect(() => {
    if (!containerRef.current || !currentPano) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(fov, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 0.1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio); // Sharp rendering on mobile
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    containerRef.current.appendChild(renderer.domElement);

    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1);

    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load(currentPano.url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
    });

    const material = new THREE.MeshBasicMaterial({ map: texture });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    sphereRef.current = sphere;

    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      currentRotationRef.current.x += (targetRotationRef.current.x - currentRotationRef.current.x) * 0.15;
      currentRotationRef.current.y += (targetRotationRef.current.y - currentRotationRef.current.y) * 0.15;
      
      camera.rotation.order = 'YXZ';
      camera.rotation.x = currentRotationRef.current.x;
      camera.rotation.y = currentRotationRef.current.y;

      const timeSinceLastInteraction = Date.now() - lastInteractionTimeRef.current;
      if (timeSinceLastInteraction > 3000 && !isDraggingRef.current) {
        targetRotationRef.current.y += 0.001;
      }

      hotspotMeshesRef.current.forEach(mesh => {
        const s = 1 + Math.sin(Date.now() * 0.005) * 0.2;
        mesh.scale.set(s, s, s);
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationIdRef.current);
      window.removeEventListener('resize', handleResize);
      if (containerRef.current) containerRef.current.innerHTML = '';
      geometry.dispose();
      material.dispose();
      texture.dispose();
    };
  }, [currentPano]);

  // Combined Interaction Handler (Mouse + Touch)
  useEffect(() => {
    if (!rendererRef.current) return;
    const canvas = rendererRef.current.domElement;

    const resetInactivity = () => { lastInteractionTimeRef.current = Date.now(); };

    const handleStart = (clientX, clientY) => {
      isDraggingRef.current = true;
      resetInactivity();
      previousMousePositionRef.current = { x: clientX, y: clientY };
    };

    const handleMove = (clientX, clientY) => {
      resetInactivity();
      if (isDraggingRef.current) {
        const deltaX = clientX - previousMousePositionRef.current.x;
        const deltaY = clientY - previousMousePositionRef.current.y;
        targetRotationRef.current.y += deltaX * 0.003; // Thoda fast sensitivity for mobile
        targetRotationRef.current.x += deltaY * 0.003;
        targetRotationRef.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotationRef.current.x));
        previousMousePositionRef.current = { x: clientX, y: clientY };
      }
    };

    // Events
    const onMouseDown = (e) => handleStart(e.clientX, e.clientY);
    const onTouchStart = (e) => handleStart(e.touches[0].clientX, e.touches[0].clientY);
    
    const onMouseMove = (e) => {
        handleMove(e.clientX, e.clientY);
        // Raycaster logic for hover (Desktop only)
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        raycasterRef.current.setFromCamera(mouse, cameraRef.current);
        const intersects = raycasterRef.current.intersectObjects(hotspotMeshesRef.current);
        if (intersects.length > 0) setHoveredHotspot(intersects[0].object.userData.hotspotId);
        else setHoveredHotspot(null);
    };

    const onTouchMove = (e) => {
        e.preventDefault(); // Stop scrolling while rotating
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    const onEnd = () => { isDraggingRef.current = false; };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchend', onEnd);

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchend', onEnd);
    };
  }, [isAddingHotspot, hotspots]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setCurrentPano({ id: Date.now(), url: ev.target.result });
        setHotspots([]);
        setIsSidebarOpen(true); // Open sidebar after upload
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="h-screen w-full bg-gray-900 flex flex-col overflow-hidden fixed inset-0">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-3 flex items-center justify-between z-30 shadow-lg">
        <div className="flex items-center gap-3">
            {currentPano && (
                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-gray-700 rounded-lg text-white">
                    {isSidebarOpen ? <X size={24}/> : <Menu size={24} />}
                </button>
            )}
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <RotateCw size={20} className="text-blue-500" /> <span className="hidden sm:inline">360° Studio</span>
            </h1>
        </div>
        <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 transition-all text-sm font-medium">
          <Upload size={16} /> Upload <input type="file" hidden onChange={handleImageUpload} accept="image/*" />
        </label>
      </div>

      <div className="flex-1 flex relative overflow-hidden">
        {/* Responsive Sidebar (Sliding Drawer) */}
        {currentPano && (
          <div className={`
            absolute lg:relative z-20 h-full w-72 bg-gray-800 border-r border-gray-700 p-4 flex flex-col gap-4 
            transition-transform duration-300 ease-in-out shadow-2xl
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:-ml-72'}
          `}>
            <button 
              onClick={() => {
                setIsAddingHotspot(!isAddingHotspot);
                if(window.innerWidth < 1024) setIsSidebarOpen(false); // Mobile pe menu band kar do point add karte waqt
              }} 
              className={`w-full py-3 rounded-lg flex items-center justify-center gap-2 font-bold ${isAddingHotspot ? 'bg-orange-600 animate-pulse' : 'bg-purple-600'} text-white transition-colors`}
            >
              <Plus size={18}/> {isAddingHotspot ? 'Click on Viewer' : 'Add Hotspot'}
            </button>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-4">Saved Hotspots ({hotspots.length})</h3>
              <div className="space-y-2">
                {hotspots.map(h => (
                  <div key={h.id} className={`p-3 rounded-lg flex justify-between items-center group transition-all ${hoveredHotspot === h.id ? 'bg-blue-900/40 ring-1 ring-blue-500' : 'bg-gray-700 hover:bg-gray-600'}`}>
                    <span className="text-white text-sm truncate">{h.label || 'Unnamed Point'}</span>
                    <div className="flex gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                      <Edit2 size={14} className="text-gray-400 cursor-pointer hover:text-white" onClick={() => setEditingHotspot(h)}/>
                      <Trash2 size={14} className="text-red-400 cursor-pointer hover:text-red-300" onClick={() => setHotspots(hotspots.filter(x => x.id !== h.id))}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 3D Viewer Container */}
        <div className="flex-1 relative bg-black touch-none">
          {!currentPano ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 p-6 text-center">
              <Upload size={64} className="mb-4 opacity-20" />
              <p className="text-lg">Please upload a 360° Panoramic image to start</p>
            </div>
          ) : (
            <>
              <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
              {isAddingHotspot && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-orange-600 text-white px-6 py-2 rounded-full text-sm font-bold shadow-xl animate-bounce z-10">
                  Tap on screen to place
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Hotspot Edit Modal */}
      {editingHotspot && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[100] p-6">
          <div className="bg-gray-800 p-6 rounded-2xl w-full max-w-sm border border-gray-700 shadow-2xl">
            <h3 className="text-white font-bold mb-4 text-xl">Hotspot Details</h3>
            <input 
              autoFocus
              className="w-full bg-gray-700 text-white p-4 rounded-xl mb-4 outline-none focus:ring-2 focus:ring-blue-500" 
              placeholder="Enter Label (e.g. Kitchen)..." 
              value={editingHotspot.label}
              onChange={e => setEditingHotspot({...editingHotspot, label: e.target.value})}
            />
            <div className="flex gap-3">
                <button className="flex-1 bg-gray-700 text-white py-3 rounded-xl font-bold" onClick={() => setEditingHotspot(null)}>Cancel</button>
                <button className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold" onClick={() => {
                  setHotspots(prev => prev.map(h => h.id === editingHotspot.id ? editingHotspot : h));
                  setEditingHotspot(null);
                }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}