"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { ALL_GTA_VEHICLES, GTAVehicleData } from '@/data/vehicles';
import { Download, Upload, Plus, Car, Info, Trash2, Search, X, Copy, Check, Moon, Sun, Image as ImageIcon, ImageOff, Edit2, Save, ArrowLeft, Filter, LayoutList, Building2, CheckSquare, Square } from 'lucide-react';

export default function App() {
  // Authentication & Preferences
  const [session, setSession] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isGrayscale, setIsGrayscale] = useState(true);

  // Core Data
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Sorting & Filtering State
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [inventorySearch, setInventorySearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{classes: string[], drives: string[]}>({ classes: [], drives: [] });
  const [viewMode, setViewMode] = useState<'list' | 'garage'>('list');

  // Input States (Add Form)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCarMeta, setSelectedCarMeta] = useState<GTAVehicleData | null>(null);
  const [garageLocation, setGarageLocation] = useState('');
  const [showGarageDropdown, setShowGarageDropdown] = useState(false);

  // Edit & Bulk State
  const [isEditing, setIsEditing] = useState(false);
  const [editStorage, setEditStorage] = useState('');
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStorage, setBulkStorage] = useState('');
  const [showBulkStorageInput, setShowBulkStorageInput] = useState(false);

  // Import/Export States
  const [showImportModal, setShowImportModal] = useState(false);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [copiedGeminiPrompt, setCopiedGeminiPrompt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. LIFECYCLE & PREFERENCES
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        const prefs = session.user.user_metadata;
        if (prefs?.isDarkMode !== undefined) setIsDarkMode(prefs.isDarkMode);
        if (prefs?.isGrayscale !== undefined) setIsGrayscale(prefs.isGrayscale);
        fetchUserInventory();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchUserInventory();
      else setVehicles([]);
    });

    return () => subscription.unsubscribe();
  }, []);

  const toggleDarkMode = async () => {
    const newVal = !isDarkMode;
    setIsDarkMode(newVal);
    if (session) await supabase.auth.updateUser({ data: { isDarkMode: newVal, isGrayscale } });
  };

  const toggleGrayscale = async () => {
    const newVal = !isGrayscale;
    setIsGrayscale(newVal);
    if (session) await supabase.auth.updateUser({ data: { isDarkMode, isGrayscale: newVal } });
  };

  // 2. DATABASE OPERATIONS
  const fetchUserInventory = async () => {
    const { data, error } = await supabase.from('user_vehicles').select('*');
    if (!error && data && Array.isArray(data)) {
      const integratedData = data.map((userCar: any) => {
        const staticMeta = Array.isArray(ALL_GTA_VEHICLES) ? ALL_GTA_VEHICLES.find(car => car && car.id === userCar.vehicle_id) : undefined;
        return {
          ...staticMeta, 
          ...userCar,    
          name: staticMeta ? staticMeta.name : (userCar.name || "Custom Vehicle"),
          manufacturer: staticMeta ? staticMeta.manufacturer : (userCar.manufacturer || "Custom"),
          class: staticMeta ? staticMeta.class : (userCar.class || "Custom"),
          maxSpeed: staticMeta ? staticMeta.maxSpeed : (userCar.max_speed || "N/A"),
          cost: staticMeta ? staticMeta.cost : 0,
          driveTrain: staticMeta ? staticMeta.driveTrain : "N/A"
        };
      });
      setVehicles(integratedData);
    } else {
      setVehicles([]);
    }
  };

  const handleGoogleLogin = async () => {
    setLoadingAuth(true);
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) alert(error.message);
    setLoadingAuth(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSelectedVehicle(null);
    setShowMobileDetail(false);
    setSelectedIds(new Set());
  };

  const saveVehicleToInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !session) return;
    
    const isCustom = !selectedCarMeta;
    const newRow = { 
      user_id: session.user.id, 
      vehicle_id: isCustom ? `custom-${Date.now()}` : selectedCarMeta.id, 
      storage: garageLocation.trim() || "Unassigned", 
      name: isCustom ? searchQuery : selectedCarMeta.name, 
      manufacturer: isCustom ? "Custom" : selectedCarMeta.manufacturer 
    };

    const { data, error } = await supabase.from('user_vehicles').insert([newRow]).select();
    if (error) alert("Error: " + error.message);
    else if (data && data.length > 0) {
      setVehicles([{ ...data[0], ...selectedCarMeta }, ...vehicles]);
      resetAddForm();
    }
  };

  const updateVehicleDetails = async () => {
    if (!selectedVehicle || !session) return;
    const { error } = await supabase.from('user_vehicles').update({ storage: editStorage || "Unassigned" }).eq('id', selectedVehicle.id);
    if (!error) {
      const updatedVehicles = vehicles.map(v => v.id === selectedVehicle.id ? { ...v, storage: editStorage || "Unassigned" } : v);
      setVehicles(updatedVehicles);
      setSelectedVehicle({ ...selectedVehicle, storage: editStorage || "Unassigned" });
      setIsEditing(false);
    } else {
      alert("Error updating: " + error.message);
    }
  };

  const deleteVehicleFromInventory = async (id: string) => {
    if (!confirm("Are you sure you want to delete this vehicle?")) return;
    const { error } = await supabase.from('user_vehicles').delete().eq('id', id);
    if (!error) {
      setVehicles(vehicles.filter(v => v.id !== id));
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
      if (selectedVehicle?.id === id) {
        setSelectedVehicle(null);
        setShowMobileDetail(false);
      }
    } else {
      alert("Error: " + error.message);
    }
  };

  // Bulk Operations
  const toggleSelection = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent opening detail view
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const handleBulkMove = async () => {
    if (!session || selectedIds.size === 0) return;
    const newStorage = bulkStorage.trim() || "Unassigned";
    
    // Convert Set to Array for Supabase 'in' query
    const idsToUpdate = Array.from(selectedIds);
    
    const { error } = await supabase
      .from('user_vehicles')
      .update({ storage: newStorage })
      .in('id', idsToUpdate);

    if (!error) {
      const updatedVehicles = vehicles.map(v => selectedIds.has(v.id) ? { ...v, storage: newStorage } : v);
      setVehicles(updatedVehicles);
      setSelectedIds(new Set());
      setBulkStorage('');
      setShowBulkStorageInput(false);
      if (selectedVehicle && selectedIds.has(selectedVehicle.id)) {
        setSelectedVehicle({ ...selectedVehicle, storage: newStorage });
      }
    } else {
      alert("Bulk Update Error: " + error.message);
    }
  };

  const resetAddForm = () => { setShowAddForm(false); setSearchQuery(''); setSelectedCarMeta(null); setGarageLocation(''); setShowGarageDropdown(false); };

  // 3. FLEET DATA PROCESSING (Fuzzy Search, Filtering, Sorting)
  const fuzzyMatch = (pattern: string, str: string) => {
    if (!pattern) return true;
    if (!str) return false;
    pattern = pattern.toLowerCase();
    str = str.toLowerCase();
    let patternIdx = 0;
    for (let strIdx = 0; strIdx < str.length && patternIdx < pattern.length; strIdx++) {
      if (pattern[patternIdx] === str[strIdx]) patternIdx++;
    }
    return patternIdx === pattern.length;
  };

  const availableClasses = Array.from(new Set(vehicles.map(v => v.class).filter(c => c && c !== "Custom"))).sort();
  const availableDrives = Array.from(new Set(vehicles.map(v => v.driveTrain).filter(d => d && d !== "N/A"))).sort();

  const toggleFilter = (type: 'classes' | 'drives', value: string) => {
    setActiveFilters(prev => {
      const current = prev[type];
      return { ...prev, [type]: current.includes(value) ? current.filter(i => i !== value) : [...current, value] };
    });
  };

  const processedVehicles = useMemo(() => {
    let filtered = vehicles.filter(v => {
      const matchSearch = fuzzyMatch(inventorySearch, v.name) || fuzzyMatch(inventorySearch, v.manufacturer);
      const matchClass = activeFilters.classes.length === 0 || activeFilters.classes.includes(v.class);
      const matchDrive = activeFilters.drives.length === 0 || activeFilters.drives.includes(v.driveTrain);
      return matchSearch && matchClass && matchDrive;
    });

    if (sortConfig !== null) {
      filtered.sort((a, b) => {
        let aValue = a[sortConfig.key]; let bValue = b[sortConfig.key];
        if (sortConfig.key === 'maxSpeed') { aValue = parseFloat(aValue) || 0; bValue = parseFloat(bValue) || 0; }
        if (sortConfig.key === 'cost') { aValue = a.cost || 0; bValue = b.cost || 0; }
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [vehicles, inventorySearch, activeFilters, sortConfig]);

  const groupedVehicles = useMemo(() => {
    return processedVehicles.reduce((acc, vehicle) => {
      const garage = vehicle.storage || "Unassigned";
      if (!acc[garage]) acc[garage] = [];
      acc[garage].push(vehicle);
      return acc;
    }, {} as Record<string, any[]>);
  }, [processedVehicles]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const filteredDropdownOptions = ALL_GTA_VEHICLES.filter(car => {
    const nameMatch = car && typeof car.name === 'string' ? car.name.toLowerCase().includes(searchQuery.toLowerCase()) : false;
    const mfgMatch = car && typeof car.manufacturer === 'string' ? car.manufacturer.toLowerCase().includes(searchQuery.toLowerCase()) : false;
    return nameMatch || mfgMatch;
  }).slice(0, 6);

  const uniqueGarages = Array.from(new Set(vehicles.map(v => v.storage).filter(s => s && s !== "Unassigned"))).sort();

  // 4. IMPORT / EXPORT (With Smart Duplicate Handling)
  const handleExport = () => {
    const exportPayload = vehicles.map(v => ({ name: v.name, storage: v.storage }));
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `gta_vehicles_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!Array.isArray(json)) throw new Error("File must contain a JSON array.");
        
        const validRows: any[] = [];
        const failedNames: string[] = [];
        let duplicatesSkipped = 0;

        json.forEach((item: any) => {
          const targetName = item.name ? item.name.toLowerCase().trim() : '';
          const targetStorage = item.storage || "Unassigned";
          
          const matchedCar = ALL_GTA_VEHICLES.find(c => c.name.toLowerCase() === targetName);
          
          if (matchedCar) {
            // Smart Duplicate Check: Is this exact car already in this exact garage?
            const isDuplicate = vehicles.some(v => 
              v.vehicle_id === matchedCar.id && 
              (v.storage === targetStorage || (!v.storage && targetStorage === "Unassigned"))
            );

            if (isDuplicate) {
              duplicatesSkipped++;
            } else {
              validRows.push({ user_id: session.user.id, vehicle_id: matchedCar.id, storage: targetStorage, name: matchedCar.name, manufacturer: matchedCar.manufacturer });
            }
          } else {
            failedNames.push(item.name || "Unnamed Entry");
          }
        });

        if (validRows.length > 0) {
          const { error } = await supabase.from('user_vehicles').insert(validRows);
          if (error) throw error;
          fetchUserInventory();
        }
        setShowImportModal(false);
        
        // Detailed feedback string
        let feedback = `${validRows.length} cars imported successfully.\n`;
        if (duplicatesSkipped > 0) feedback += `${duplicatesSkipped} exact duplicates skipped.\n`;
        if (failedNames.length > 0) feedback += `${failedNames.length} imports failed (Not in DB): ${failedNames.join(', ')}`;
        
        alert(feedback.trim());
      } catch (err: any) { alert("Import Failed: " + err.message); }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const copyTemplate = () => {
    navigator.clipboard.writeText(`[\n  {\n    "name": "Buffalo STX",\n    "storage": "Agency Garage"\n  }\n]`);
    setCopiedTemplate(true); setTimeout(() => setCopiedTemplate(false), 2000);
  };

  const copyGeminiPrompt = () => {
    navigator.clipboard.writeText(`List all the cars from the interaction menu video and give it in this exact JSON format:\n[\n  {\n    "name": "Car Name",\n    "storage": "Garage Name"\n  }\n]\nIf there is a mistake in my recording's text recognition, just fix it based on GTA logic.`);
    setCopiedGeminiPrompt(true); setTimeout(() => setCopiedGeminiPrompt(false), 2000);
  };

  // UI Theme Variables
  const baseBg = isDarkMode ? "bg-neutral-950" : "bg-[#f4f4f0]";
  const cardBg = isDarkMode ? "bg-neutral-900" : "bg-white";
  const textMain = isDarkMode ? "text-neutral-100" : "text-black";
  const textMuted = isDarkMode ? "text-neutral-400" : "text-black/60";
  const borderMain = isDarkMode ? "border-neutral-700" : "border-black";
  const hoverBg = isDarkMode ? "hover:bg-neutral-800" : "hover:bg-[#e5e5e5]";
  const shadowMain = isDarkMode ? "shadow-[6px_6px_0_0_#262626]" : "shadow-[6px_6px_0_0_#000000]";
  const shadowSmall = isDarkMode ? "shadow-[3px_3px_0_0_#262626]" : "shadow-[3px_3px_0_0_#000000]";
  const buttonPrimary = isDarkMode ? "bg-white text-black hover:bg-neutral-200" : "bg-black text-white hover:bg-neutral-800";
  const buttonSecondary = isDarkMode ? "bg-neutral-800 text-white hover:bg-neutral-700" : "bg-white text-black hover:bg-neutral-100";
  
  const selectedRowBg = isDarkMode ? "bg-white text-black" : "bg-black text-white";

  // Reusable Vehicle Row Component
  const VehicleRow = ({ v, isSelected }: { v: any, isSelected: boolean }) => (
    <div onClick={() => { setSelectedVehicle(v); setIsEditing(false); setShowMobileDetail(true); }} className={`grid grid-cols-[auto_1fr_1fr] sm:grid-cols-[auto_2fr_2fr_1fr_1fr_1fr] gap-3 sm:gap-4 p-3.5 cursor-pointer items-center transition-all ${isSelected ? selectedRowBg : hoverBg}`}>
      <button onClick={(e) => toggleSelection(e, v.id)} className={`transition-colors ${selectedIds.has(v.id) ? (isDarkMode ? 'text-black' : 'text-white') : textMuted}`}>
        {selectedIds.has(v.id) ? <CheckSquare size={16} /> : <Square size={16} />}
      </button>
      <span className="font-bold truncate">{v.name}</span>
      <span className={`truncate text-xs sm:text-sm ${isSelected ? 'opacity-80' : textMuted}`}>{v.storage}</span>
      <span className={`truncate text-xs sm:text-sm hidden sm:block ${isSelected ? 'opacity-80' : textMuted}`}>{v.class}</span>
      <span className="truncate text-xs sm:text-sm hidden sm:block">{v.maxSpeed}</span>
      <span className="truncate text-xs sm:text-sm hidden sm:block">{v.cost > 0 ? `$${(v.cost / 1000).toLocaleString()}k` : 'Free'}</span>
    </div>
  );

  // RENDERING: GATEWAY
  if (!session) {
    return (
      <div className={`min-h-screen ${baseBg} flex items-center justify-center p-4 font-sans transition-colors duration-500`}>
        <div className={`w-full max-w-md ${cardBg} border-2 ${borderMain} p-8 ${shadowMain} animate-in fade-in zoom-in duration-500`}>
          <h1 className={`text-3xl font-black uppercase tracking-tight ${textMain} mb-2`}>Vehicle Tracker</h1>
          <p className={`text-sm font-semibold ${textMuted} mb-8 border-b-2 ${borderMain} pb-4`}>Sign in to manage your collection</p>
          <button onClick={handleGoogleLogin} disabled={loadingAuth} className={`w-full ${buttonPrimary} border-2 ${borderMain} py-3.5 font-bold uppercase tracking-wide text-sm transition-all flex items-center justify-center gap-3 ${shadowSmall} hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none`}>
             <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
             {loadingAuth ? "Signing In..." : "Continue with Google"}
          </button>
        </div>
      </div>
    );
  }

  // RENDERING: DASHBOARD
  return (
    <div className={`min-h-screen ${baseBg} ${textMain} font-sans flex flex-col transition-colors duration-300`}>
      {/* HEADER */}
      <header className={`flex flex-col sm:flex-row justify-between items-center p-4 sm:p-5 ${cardBg} border-b-2 ${borderMain} z-20 relative`}>
        <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight flex items-center gap-2 mb-4 sm:mb-0">
          <Car className={textMain} size={24} /> GTA Tracker
        </h1>
        <div className="flex flex-wrap justify-center gap-3 sm:gap-4 items-center w-full sm:w-auto">
          <button onClick={toggleGrayscale} className={`p-2 border-2 border-transparent rounded ${hoverBg} transition-colors`} title="Toggle Image Style">
            {isGrayscale ? <ImageOff size={18} /> : <ImageIcon size={18} />}
          </button>
          <button onClick={toggleDarkMode} className={`p-2 border-2 border-transparent rounded ${hoverBg} transition-colors`} title="Toggle Theme">
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className={`w-px h-6 ${isDarkMode ? 'bg-neutral-700' : 'bg-neutral-300'} mx-1 hidden sm:block`}></div>
          <button onClick={handleExport} className={`font-semibold text-xs uppercase tracking-wide px-3 py-1.5 rounded ${hoverBg} flex items-center gap-1.5 transition-colors`}><Download size={14}/> Export</button>
          <button onClick={() => setShowImportModal(true)} className={`font-semibold text-xs uppercase tracking-wide px-3 py-1.5 rounded ${hoverBg} flex items-center gap-1.5 transition-colors`}><Upload size={14}/> Import</button>
          <div className={`w-px h-6 ${isDarkMode ? 'bg-neutral-700' : 'bg-neutral-300'} mx-1 hidden sm:block`}></div>
          <button onClick={handleSignOut} className={`font-bold text-xs uppercase tracking-wide rounded ${buttonSecondary} px-4 py-2 border-2 ${borderMain} transition-colors ${shadowSmall} hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none`}>Sign Out</button>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-[1600px] mx-auto w-full animate-in fade-in duration-500 relative">
        
        {/* LEFT COLUMN: DATATABLE & CONTROLS */}
        <div className={`lg:col-span-2 flex flex-col ${cardBg} border-2 ${borderMain} ${shadowMain}`}>
          
          {/* CONTROL TOOLBAR */}
          <div className={`p-4 border-b-2 ${borderMain} flex flex-col gap-4 ${isDarkMode ? 'bg-neutral-800/50' : 'bg-neutral-100/50'}`}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <h2 className="font-bold uppercase text-sm tracking-wide shrink-0">Fleet ({processedVehicles.length})</h2>
              
              <div className="flex flex-1 w-full gap-2 justify-end">
                <div className="relative w-full max-w-xs hidden sm:block">
                  <Search size={14} className={`absolute left-3 top-2.5 ${textMuted}`} />
                  <input type="text" placeholder="Fuzzy Search..." value={inventorySearch} onChange={(e) => setInventorySearch(e.target.value)} className={`w-full ${cardBg} ${textMain} border-2 ${borderMain} py-1.5 pl-8 pr-3 text-sm font-medium outline-none transition-colors rounded`} />
                </div>
                
                <div className={`flex border-2 ${borderMain} rounded overflow-hidden shrink-0`}>
                  <button onClick={() => setViewMode('list')} className={`p-1.5 px-3 transition-colors ${viewMode === 'list' ? selectedRowBg : cardBg + ' ' + hoverBg}`} title="List View"><LayoutList size={16} /></button>
                  <div className={`w-px ${borderMain}`}></div>
                  <button onClick={() => setViewMode('garage')} className={`p-1.5 px-3 transition-colors ${viewMode === 'garage' ? selectedRowBg : cardBg + ' ' + hoverBg}`} title="Garage View"><Building2 size={16} /></button>
                </div>

                <button onClick={() => setShowFilters(!showFilters)} className={`p-1.5 px-3 border-2 ${borderMain} rounded flex items-center gap-2 font-bold text-xs uppercase transition-colors ${showFilters || activeFilters.classes.length > 0 || activeFilters.drives.length > 0 ? selectedRowBg : cardBg + ' ' + hoverBg}`}>
                  <Filter size={14} /> <span className="hidden sm:inline">Filters</span>
                </button>
                <button onClick={() => setShowAddForm(!showAddForm)} className={`p-1.5 px-3 ${buttonPrimary} border-2 ${borderMain} rounded font-bold text-xs uppercase transition-colors flex items-center gap-2 shrink-0`}>
                  {showAddForm ? <X size={14}/> : <Plus size={14} />} <span className="hidden sm:inline">{showAddForm ? 'Cancel' : 'Add'}</span>
                </button>
              </div>
            </div>

            {/* EXPANDABLE FILTER PANEL */}
            {showFilters && (
              <div className={`pt-4 mt-2 border-t border-dashed ${borderMain} animate-in slide-in-from-top-2 flex flex-col gap-4`}>
                <div className="sm:hidden relative w-full mb-2">
                  <Search size={14} className={`absolute left-3 top-2.5 ${textMuted}`} />
                  <input type="text" placeholder="Fuzzy Search..." value={inventorySearch} onChange={(e) => setInventorySearch(e.target.value)} className={`w-full ${cardBg} ${textMain} border-2 ${borderMain} py-1.5 pl-8 pr-3 text-sm font-medium outline-none transition-colors rounded`} />
                </div>
                <div>
                  <p className={`text-xs font-bold uppercase tracking-wide ${textMuted} mb-2`}>Vehicle Class</p>
                  <div className="flex flex-wrap gap-2">
                    {availableClasses.map(c => (
                      <button key={c} onClick={() => toggleFilter('classes', c)} className={`px-2 py-1 border-2 ${borderMain} text-xs font-bold rounded transition-colors ${activeFilters.classes.includes(c) ? selectedRowBg : cardBg + ' ' + hoverBg}`}>{c}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className={`text-xs font-bold uppercase tracking-wide ${textMuted} mb-2`}>Drivetrain</p>
                  <div className="flex flex-wrap gap-2">
                    {availableDrives.map(d => (
                      <button key={d} onClick={() => toggleFilter('drives', d)} className={`px-2 py-1 border-2 ${borderMain} text-xs font-bold rounded transition-colors ${activeFilters.drives.includes(d) ? selectedRowBg : cardBg + ' ' + hoverBg}`}>{d}</button>
                    ))}
                  </div>
                </div>
                {(activeFilters.classes.length > 0 || activeFilters.drives.length > 0) && (
                   <div className="flex justify-end">
                     <button onClick={() => setActiveFilters({classes: [], drives: []})} className={`text-xs font-bold uppercase hover:underline ${textMuted}`}>Clear All Filters</button>
                   </div>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-x-auto p-0 relative">
            
            {/* BULK ACTIONS BAR */}
            {selectedIds.size > 0 && (
               <div className={`absolute top-0 left-0 w-full z-30 p-3 border-b-2 ${borderMain} animate-in slide-in-from-top-2 flex justify-between items-center ${isDarkMode ? 'bg-blue-900 text-white' : 'bg-blue-600 text-white'}`}>
                 <span className="font-bold text-sm">{selectedIds.size} Selected</span>
                 <div className="flex gap-2">
                   {showBulkStorageInput ? (
                     <div className="flex gap-2">
                       <input type="text" placeholder="New Garage..." value={bulkStorage} onChange={(e) => setBulkStorage(e.target.value)} className="px-2 py-1 text-black text-sm rounded outline-none" />
                       <button onClick={handleBulkMove} className="px-3 py-1 bg-black text-white font-bold text-xs uppercase rounded hover:bg-neutral-800">Move</button>
                       <button onClick={() => setShowBulkStorageInput(false)} className="px-2 py-1 hover:opacity-70"><X size={16}/></button>
                     </div>
                   ) : (
                     <>
                       <button onClick={() => setShowBulkStorageInput(true)} className="px-3 py-1.5 bg-black/20 hover:bg-black/40 font-bold text-xs uppercase rounded transition-colors flex items-center gap-1.5"><Building2 size={14}/> Move Selected</button>
                       <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 hover:bg-black/20 font-bold text-xs uppercase rounded transition-colors">Deselect</button>
                     </>
                   )}
                 </div>
               </div>
            )}

            {showAddForm && (
              <form onSubmit={saveVehicleToInventory} className={`absolute inset-0 z-20 ${baseBg} p-4 sm:p-6 border-b-2 ${borderMain} animate-in slide-in-from-top-4 duration-300 overflow-y-auto`}>
                <h3 className={`text-lg font-bold uppercase mb-4 border-b-2 ${borderMain} pb-2`}>Register New Vehicle</h3>
                <div className="flex flex-col gap-5 mt-4">
                  <div className="relative flex flex-col gap-1.5">
                    <label className={`text-xs font-bold uppercase tracking-wide ${textMuted}`}>Vehicle Name</label>
                    <div className="relative">
                      <Search size={16} className={`absolute left-3 top-3.5 ${textMuted}`} />
                      <input type="text" placeholder="Type vehicle name... (Custom names allowed)" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setSelectedCarMeta(null); }} className={`w-full ${cardBg} ${textMain} border-2 ${borderMain} p-2.5 pl-9 text-sm outline-none transition-colors rounded`} required />
                    </div>
                    {searchQuery && !selectedCarMeta && filteredDropdownOptions.length > 0 && (
                      <div className={`absolute top-[68px] left-0 w-full ${cardBg} border-2 ${borderMain} shadow-lg z-50 divide-y ${isDarkMode ? 'divide-neutral-800' : 'divide-neutral-200'} max-h-48 overflow-y-auto rounded`}>
                        {filteredDropdownOptions.map(car => (
                          <div key={car.id} onClick={() => { setSelectedCarMeta(car); setSearchQuery(`${car.manufacturer} ${car.name}`); }} className={`p-3 ${hoverBg} cursor-pointer flex justify-between text-sm transition-colors`}>
                            <span className="font-medium">{car.manufacturer} {car.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="relative flex flex-col gap-1.5">
                    <label className={`text-xs font-bold uppercase tracking-wide ${textMuted}`}>Garage Location (Optional)</label>
                    <input type="text" placeholder="e.g. Eclipse Blvd Garage" value={garageLocation} onChange={(e) => setGarageLocation(e.target.value)} onFocus={() => setShowGarageDropdown(true)} onBlur={() => setTimeout(() => setShowGarageDropdown(false), 200)} className={`w-full ${cardBg} ${textMain} border-2 ${borderMain} p-2.5 text-sm outline-none transition-colors rounded`} />
                    {showGarageDropdown && uniqueGarages.length > 0 && (
                       <div className={`absolute top-[68px] left-0 w-full ${cardBg} border-2 ${borderMain} shadow-lg z-40 max-h-40 overflow-y-auto rounded`}>
                         {uniqueGarages.filter(g => g.toLowerCase().includes(garageLocation.toLowerCase())).map(garage => (
                           <div key={garage} onMouseDown={() => setGarageLocation(garage)} className={`p-2.5 ${hoverBg} cursor-pointer text-sm transition-colors`}>{garage}</div>
                         ))}
                       </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6">
                  <button type="button" onClick={resetAddForm} className={`px-5 py-2.5 font-bold text-xs uppercase tracking-wide ${buttonSecondary} border-2 ${borderMain} rounded w-full sm:w-auto`}>Cancel</button>
                  <button type="submit" disabled={!searchQuery.trim()} className={`px-5 py-2.5 ${buttonPrimary} border-2 ${borderMain} rounded font-bold text-xs uppercase tracking-wide transition-all ${shadowSmall} hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none w-full sm:w-auto disabled:opacity-50`}>Save Vehicle</button>
                </div>
              </form>
            )}

            {viewMode === 'list' ? (
              /* LIST VIEW */
              <div className="w-full text-left min-w-[600px] mt-10 sm:mt-0">
                <div className={`grid grid-cols-[auto_1fr_1fr] sm:grid-cols-[auto_2fr_2fr_1fr_1fr_1fr] gap-3 sm:gap-4 p-3.5 border-b-2 ${borderMain} font-bold text-xs uppercase tracking-wide ${baseBg} select-none ${textMuted} sticky top-0 z-10`}>
                  <div className="w-4"></div>
                  <span className={`cursor-pointer ${hoverBg} transition-colors flex items-center gap-1`} onClick={() => requestSort('name')}>Vehicle {sortConfig?.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  <span className={`cursor-pointer ${hoverBg} transition-colors flex items-center gap-1`} onClick={() => requestSort('storage')}>Location {sortConfig?.key === 'storage' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  <span className={`cursor-pointer ${hoverBg} transition-colors flex items-center gap-1 hidden sm:flex`} onClick={() => requestSort('class')}>Class {sortConfig?.key === 'class' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  <span className={`cursor-pointer ${hoverBg} transition-colors flex items-center gap-1 hidden sm:flex`} onClick={() => requestSort('maxSpeed')}>Top Speed {sortConfig?.key === 'maxSpeed' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  <span className={`cursor-pointer ${hoverBg} transition-colors flex items-center gap-1 hidden sm:flex`} onClick={() => requestSort('cost')}>Value {sortConfig?.key === 'cost' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                </div>
                <div className={`divide-y-2 ${isDarkMode ? 'divide-neutral-800' : 'divide-neutral-200'}`}>
                  {processedVehicles.length > 0 ? processedVehicles.map(v => (
                    <VehicleRow key={v.id} v={v} isSelected={selectedVehicle?.id === v.id} />
                  )) : (
                    <div className="p-8 text-center text-sm font-bold uppercase tracking-widest opacity-50">No vehicles match current filters.</div>
                  )}
                </div>
              </div>
            ) : (
              /* GARAGE GROUPED VIEW */
              <div className="p-4 flex flex-col gap-6 bg-[#f4f4f0] dark:bg-neutral-950 min-h-full mt-10 sm:mt-0">
                {Object.keys(groupedVehicles).length > 0 ? Object.entries(groupedVehicles).sort(([a], [b]) => a.localeCompare(b)).map(([garage, cars]) => (
                  <div key={garage} className={`${cardBg} border-2 ${borderMain} ${shadowSmall} rounded overflow-hidden`}>
                    <div className={`px-4 py-3 border-b-2 ${borderMain} ${isDarkMode ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-black'} font-black uppercase text-sm tracking-wide flex justify-between items-center`}>
                      <span className="flex items-center gap-2"><Building2 size={16}/> {garage}</span>
                      <span className="bg-black text-white dark:bg-white dark:text-black px-2 py-0.5 rounded text-xs">{cars.length}</span>
                    </div>
                    <div className={`divide-y-2 ${isDarkMode ? 'divide-neutral-800' : 'divide-neutral-100'} min-w-[600px]`}>
                       {cars.map(v => <VehicleRow key={v.id} v={v} isSelected={selectedVehicle?.id === v.id} />)}
                    </div>
                  </div>
                )) : (
                  <div className="p-8 text-center text-sm font-bold uppercase tracking-widest opacity-50 w-full col-span-full">No vehicles match current filters.</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: SIDE PANEL (OVERLAY ON MOBILE) */}
        <div className={`
          ${showMobileDetail && selectedVehicle ? 'fixed inset-0 z-50 flex' : 'hidden lg:flex'}
          lg:static flex-col ${cardBg} border-2 ${borderMain} ${shadowMain} overflow-hidden transition-all duration-300
        `}>
          {selectedVehicle ? (
            <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300 lg:animate-none">
              
              <div className={`lg:hidden p-4 border-b-2 ${borderMain} flex justify-between items-center ${isDarkMode ? 'bg-neutral-800 text-white' : 'bg-black text-white'}`}>
                <button onClick={() => setShowMobileDetail(false)} className="flex items-center gap-2 font-bold uppercase text-xs">
                  <ArrowLeft size={16}/> Back to List
                </button>
              </div>

              <div className="relative z-10 p-5 sm:p-6 border-b-2 border-dashed border-neutral-300 dark:border-neutral-700 flex-shrink-0">
                <div className="absolute top-4 right-4 flex gap-2 z-30">
                   <button onClick={() => { setIsEditing(!isEditing); setEditStorage(selectedVehicle.storage === "Unassigned" ? "" : selectedVehicle.storage); }} className={`p-2 rounded ${cardBg} ${hoverBg} border-2 ${borderMain} transition-colors ${textMuted} hover:${textMain}`} title="Edit Details">
                     <Edit2 size={14} />
                   </button>
                   <button onClick={() => deleteVehicleFromInventory(selectedVehicle.id)} className={`p-2 rounded ${cardBg} ${hoverBg} border-2 ${borderMain} transition-colors ${textMuted} hover:${textMain}`} title="Delete Vehicle">
                     <Trash2 size={14} />
                   </button>
                </div>

                <p className={`text-xs font-bold uppercase tracking-wide ${textMuted} mb-1`}>{selectedVehicle.manufacturer?.toString()}</p>
                <h2 className="text-2xl font-black uppercase tracking-tight pr-20 truncate">{selectedVehicle.name?.toString()}</h2>
                
                <div className={`w-full h-48 ${baseBg} mt-5 border-2 ${borderMain} rounded flex items-center justify-center relative overflow-hidden group shadow-inner`}>
                   {selectedVehicle.imageUrl ? ( 
                     <img src={`https://images.weserv.nl/?url=${encodeURIComponent(selectedVehicle.imageUrl)}`} alt="Vehicle" className={`object-cover w-full h-full transition-all duration-700 group-hover:scale-105 ${isGrayscale ? 'grayscale opacity-90 group-hover:grayscale-0 group-hover:opacity-100' : ''}`} onError={(e) => { (e.target as HTMLImageElement).src = ""; }} /> 
                   ) : ( <Car size={48} className={textMuted} opacity={0.3} /> )}
                </div>
              </div>

              <div className={`flex-1 overflow-y-auto p-4 sm:p-6 ${cardBg}`}>
                {isEditing ? (
                  <div className="flex flex-col gap-4 animate-in slide-in-from-top-2">
                    <label className="flex flex-col gap-1.5">
                      <span className={`text-xs font-bold uppercase ${textMuted}`}>Update Location</span>
                      <input type="text" value={editStorage} onChange={(e) => setEditStorage(e.target.value)} placeholder="New Garage Name..." className={`w-full ${baseBg} ${textMain} border-2 ${borderMain} rounded p-2 text-sm outline-none`} />
                    </label>
                    <button onClick={updateVehicleDetails} className={`py-2 flex items-center justify-center gap-2 ${buttonPrimary} rounded text-sm font-bold border-2 ${borderMain} transition-all`}><Save size={14}/> Save Changes</button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 text-sm">
                    <DetailRow label="Location" value={selectedVehicle.storage?.toString() || "Unassigned"} isDark={isDarkMode} highlight />
                    <DetailRow label="Class" value={selectedVehicle.class?.toString() || "Custom"} isDark={isDarkMode}/>
                    <DetailRow label="Top Speed" value={selectedVehicle.maxSpeed?.toString() || "N/A"} isDark={isDarkMode}/>
                    <DetailRow label="Value" value={selectedVehicle.cost > 0 ? `$${selectedVehicle.cost.toLocaleString()}` : "Free"} isDark={isDarkMode}/>
                    <DetailRow label="Drivetrain" value={selectedVehicle.driveTrain?.toString() || "N/A"} isDark={isDarkMode}/>
                    <DetailRow label="Gears" value={selectedVehicle.driveGears || "N/A"} isDark={isDarkMode}/>
                    <DetailRow label="Weight" value={selectedVehicle.mass?.toString() || "N/A"} isDark={isDarkMode}/>
                    <DetailRow label="HSW Upgrade" value={selectedVehicle.hswAvailable ? "Available" : "Not Supported"} isDark={isDarkMode}/>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={`flex-1 flex flex-col items-center justify-center p-8 text-center ${textMuted} hidden lg:flex`}>
              <Info size={40} className="mb-4 opacity-50" />
              <p className={`font-bold uppercase tracking-wide text-sm ${textMain}`}>No Vehicle Selected</p>
              <p className="text-xs mt-1 max-w-[200px]">Click a row in your list to view or edit vehicle details.</p>
            </div>
          )}
        </div>
      </main>

      {/* IMPORT MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`${cardBg} border-2 ${borderMain} rounded p-6 sm:p-8 w-full max-w-2xl ${shadowMain} relative animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto`}>
            <button onClick={() => setShowImportModal(false)} className={`absolute top-4 right-4 p-1.5 rounded ${hoverBg} transition-colors ${textMuted} hover:${textMain}`}><X size={18} /></button>
            <h2 className="text-xl font-bold uppercase tracking-wide mb-1">Import Vehicles</h2>
            <p className={`text-sm mb-6 ${textMuted}`}>Upload a JSON file containing your fleet data.</p>
            
            {/* MANUAL IMPORT SECTION */}
            <div className="mb-8">
              <h3 className={`text-xs font-bold uppercase tracking-wide ${textMuted} mb-2`}>Manual JSON Format</h3>
              <div className={`bg-neutral-900 p-4 rounded font-mono text-xs overflow-x-auto relative border-2 ${isDarkMode ? 'border-neutral-700' : 'border-black'}`}>
                <button onClick={copyTemplate} className="absolute top-2 right-2 p-1.5 rounded bg-white text-black hover:bg-neutral-300 flex items-center gap-1.5 transition-colors font-sans text-[10px] font-bold uppercase">
                  {copiedTemplate ? <><Check size={12}/> Copied</> : <><Copy size={12}/> Copy</>}
                </button>
                <pre className="text-neutral-100">
{`[
  {
    "name": "Buffalo STX",
    "storage": "Agency Garage"
  }
]`}
                </pre>
              </div>
            </div>

            {/* AI AUTOMATION SECTION */}
            <div className={`p-4 border-2 ${borderMain} rounded mb-6 ${isDarkMode ? 'bg-blue-900/10' : 'bg-blue-50'}`}>
              <h3 className="text-sm font-bold uppercase tracking-wide mb-2 flex items-center gap-2">
                <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[10px]">NEW</span> AI Auto-Import
              </h3>
              <p className={`text-xs mb-4 ${textMuted}`}>
                To easily import all your cars at once: record your screen, open the Interaction Menu {'>'} Manage Vehicles {'>'} Vehicle Organization, and scroll through your garages. 
                Upload the video to Gemini and use this prompt. <a href="#" className="text-blue-500 hover:underline font-semibold">Click here to see a video demonstration.</a>
              </p>
              
              <div className={`bg-neutral-900 p-4 rounded font-mono text-xs relative border-2 ${isDarkMode ? 'border-neutral-700' : 'border-black'}`}>
                <button onClick={copyGeminiPrompt} className="absolute top-2 right-2 p-1.5 rounded bg-white text-black hover:bg-neutral-300 flex items-center gap-1.5 transition-colors font-sans text-[10px] font-bold uppercase">
                  {copiedGeminiPrompt ? <><Check size={12}/> Copied</> : <><Copy size={12}/> Copy</>}
                </button>
                <p className="text-neutral-100 whitespace-pre-wrap pr-16 leading-relaxed">
                  List all the cars from the interaction menu video and give it in this exact JSON format:
                  <br/><br/>
                  {`[\n  {\n    "name": "Car Name",\n    "storage": "Garage Name"\n  }\n]`}
                  <br/><br/>
                  If there is a mistake in my recording's text recognition, just fix it based on GTA logic.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t-2 border-dashed border-neutral-300 dark:border-neutral-700">
               <input type="file" accept=".json" id="json-upload" className="hidden" ref={fileInputRef} onChange={handleImport} />
               <label htmlFor="json-upload" className={`cursor-pointer px-5 py-2.5 ${buttonPrimary} border-2 ${borderMain} rounded font-bold text-sm uppercase tracking-wide transition-all ${shadowSmall} hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none text-center w-full sm:w-auto`}>
                 Select JSON File to Upload
               </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, isDark, highlight = false }: { label: string, value: any, isDark: boolean, highlight?: boolean }) {
  const highlightClass = highlight ? (isDark ? 'bg-neutral-800 text-white border-l-2 border-white' : 'bg-neutral-200 text-black border-l-2 border-black') : '';
  
  return (
    <div className={`flex justify-between items-center p-2.5 rounded ${highlightClass}`}>
      <span className={`font-medium text-xs ${highlight ? 'opacity-80' : (isDark ? 'text-neutral-400' : 'text-neutral-500')}`}>{label}</span>
      <span className={`font-bold text-right truncate max-w-[150px] sm:max-w-[200px]`}>{value || 'N/A'}</span>
    </div>
  );
}
