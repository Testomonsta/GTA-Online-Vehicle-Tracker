"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { ALL_GTA_VEHICLES, GTAVehicleData } from '@/data/vehicles';
import { Download, Upload, Plus, Car, Info, Trash2, Search, X, Copy, Check, Moon, Sun, Image as ImageIcon, ImageOff, Edit2, Save, ArrowLeft } from 'lucide-react';

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
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  // Input States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCarMeta, setSelectedCarMeta] = useState<GTAVehicleData | null>(null);
  const [garageLocation, setGarageLocation] = useState('');
  const [showGarageDropdown, setShowGarageDropdown] = useState(false);

  // Edit State & Mobile UX
  const [isEditing, setIsEditing] = useState(false);
  const [editStorage, setEditStorage] = useState('');
  const [showMobileDetail, setShowMobileDetail] = useState(false);

  // Import/Export States
  const [showImportModal, setShowImportModal] = useState(false);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
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
          ...userCar,
          ...staticMeta,
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
      if (selectedVehicle?.id === id) {
        setSelectedVehicle(null);
        setShowMobileDetail(false);
      }
    }
  };

  const resetAddForm = () => { setShowAddForm(false); setSearchQuery(''); setSelectedCarMeta(null); setGarageLocation(''); setShowGarageDropdown(false); };

  // 3. UTILITIES & CALCULATIONS
  const sortedVehicles = useMemo(() => {
    let sortableItems = [...vehicles];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key]; let bValue = b[sortConfig.key];
        if (sortConfig.key === 'maxSpeed') { aValue = parseFloat(aValue) || 0; bValue = parseFloat(bValue) || 0; }
        if (sortConfig.key === 'cost') { aValue = a.cost || 0; bValue = b.cost || 0; }
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [vehicles, sortConfig]);

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

  // 4. IMPORT / EXPORT
  const handleExport = () => {
    const exportPayload = vehicles.map(v => ({ vehicle_id: v.vehicle_id, storage: v.storage, name: v.name, manufacturer: v.manufacturer }));
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
        const newRows = json.map(item => ({ user_id: session.user.id, vehicle_id: item.vehicle_id, storage: item.storage || "Unassigned", name: item.name || 'Imported Vehicle', manufacturer: item.manufacturer || 'Unknown' }));
        const { error } = await supabase.from('user_vehicles').insert(newRows);
        if (error) throw error;
        alert(`Successfully imported ${newRows.length} vehicles.`);
        fetchUserInventory();
        setShowImportModal(false);
      } catch (err: any) { alert("Import Failed: " + err.message); }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const copyTemplate = () => {
    navigator.clipboard.writeText(`[\n  {\n    "vehicle_id": "6813-buffalo-stx-pursuit",\n    "storage": "Agency Garage"\n  }\n]`);
    setCopiedTemplate(true); setTimeout(() => setCopiedTemplate(false), 2000);
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
  
  // Selection Inversion
  const selectedRowBg = isDarkMode ? "bg-white text-black" : "bg-black text-white";

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
      <header className={`flex flex-col sm:flex-row justify-between items-center p-4 sm:p-5 ${cardBg} border-b-2 ${borderMain}`}>
        <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight flex items-center gap-2 mb-4 sm:mb-0">
          <Car className={textMain} size={24} /> GTA Tracker
        </h1>
        <div className="flex flex-wrap justify-center gap-3 sm:gap-4 items-center w-full sm:w-auto">
          <button onClick={toggleGrayscale} className={`p-2 border-2 border-transparent ${hoverBg} transition-colors`} title="Toggle Image Style">
            {isGrayscale ? <ImageOff size={18} /> : <ImageIcon size={18} />}
          </button>
          <button onClick={toggleDarkMode} className={`p-2 border-2 border-transparent ${hoverBg} transition-colors`} title="Toggle Theme">
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className={`w-px h-6 ${isDarkMode ? 'bg-neutral-700' : 'bg-neutral-300'} mx-1 hidden sm:block`}></div>
          <button onClick={handleExport} className={`font-semibold text-xs uppercase tracking-wide px-3 py-1.5 ${hoverBg} flex items-center gap-1.5 transition-colors`}><Download size={14}/> Export</button>
          <button onClick={() => setShowImportModal(true)} className={`font-semibold text-xs uppercase tracking-wide px-3 py-1.5 ${hoverBg} flex items-center gap-1.5 transition-colors`}><Upload size={14}/> Import</button>
          <div className={`w-px h-6 ${isDarkMode ? 'bg-neutral-700' : 'bg-neutral-300'} mx-1 hidden sm:block`}></div>
          <button onClick={handleSignOut} className={`font-bold text-xs uppercase tracking-wide ${buttonSecondary} px-4 py-2 border-2 ${borderMain} transition-colors ${shadowSmall} hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none`}>Sign Out</button>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-[1600px] mx-auto w-full animate-in fade-in duration-500 relative">
        
        {/* LEFT COLUMN: DATATABLE */}
        <div className={`lg:col-span-2 flex flex-col ${cardBg} border-2 ${borderMain} ${shadowMain}`}>
          <div className={`p-4 border-b-2 ${borderMain} flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3`}>
            <h2 className="font-bold uppercase text-sm tracking-wide">My Vehicles ({vehicles.length})</h2>
            <button onClick={() => setShowAddForm(!showAddForm)} className={`flex items-center gap-2 px-4 py-1.5 ${buttonPrimary} border-2 ${borderMain} font-bold text-xs uppercase transition-colors w-full sm:w-auto justify-center`}>
              {showAddForm ? "Cancel" : <><Plus size={14} /> Add Vehicle</>}
            </button>
          </div>

          <div className="flex-1 overflow-x-auto p-0">
            {showAddForm ? (
              <form onSubmit={saveVehicleToInventory} className={`m-4 sm:m-6 ${baseBg} p-4 sm:p-6 border-2 ${borderMain} animate-in slide-in-from-top-4 duration-300`}>
                <h3 className={`text-lg font-bold uppercase mb-4 border-b-2 ${borderMain} pb-2`}>Register New Vehicle</h3>
                <div className="flex flex-col gap-5 mt-4">
                  <div className="relative flex flex-col gap-1.5">
                    <label className={`text-xs font-bold uppercase tracking-wide ${textMuted}`}>Vehicle Name</label>
                    <div className="relative">
                      <Search size={16} className={`absolute left-3 top-3.5 ${textMuted}`} />
                      <input type="text" placeholder="Type vehicle name... (Custom names allowed)" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setSelectedCarMeta(null); }} className={`w-full ${cardBg} ${textMain} border-2 ${borderMain} p-2.5 pl-9 text-sm outline-none transition-colors`} required />
                    </div>
                    {searchQuery && !selectedCarMeta && filteredDropdownOptions.length > 0 && (
                      <div className={`absolute top-[68px] left-0 w-full ${cardBg} border-2 ${borderMain} shadow-lg z-50 divide-y ${isDarkMode ? 'divide-neutral-800' : 'divide-neutral-200'} max-h-48 overflow-y-auto`}>
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
                    <input type="text" placeholder="e.g. Eclipse Blvd Garage" value={garageLocation} onChange={(e) => setGarageLocation(e.target.value)} onFocus={() => setShowGarageDropdown(true)} onBlur={() => setTimeout(() => setShowGarageDropdown(false), 200)} className={`w-full ${cardBg} ${textMain} border-2 ${borderMain} p-2.5 text-sm outline-none transition-colors`} />
                    {showGarageDropdown && uniqueGarages.length > 0 && (
                       <div className={`absolute top-[68px] left-0 w-full ${cardBg} border-2 ${borderMain} shadow-lg z-40 max-h-40 overflow-y-auto`}>
                         {uniqueGarages.filter(g => g.toLowerCase().includes(garageLocation.toLowerCase())).map(garage => (
                           <div key={garage} onMouseDown={() => setGarageLocation(garage)} className={`p-2.5 ${hoverBg} cursor-pointer text-sm transition-colors`}>{garage}</div>
                         ))}
                       </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6">
                  <button type="button" onClick={resetAddForm} className={`px-5 py-2.5 font-bold text-xs uppercase tracking-wide ${buttonSecondary} border-2 ${borderMain} w-full sm:w-auto`}>Cancel</button>
                  <button type="submit" disabled={!searchQuery.trim()} className={`px-5 py-2.5 ${buttonPrimary} border-2 ${borderMain} font-bold text-xs uppercase tracking-wide transition-all ${shadowSmall} hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none w-full sm:w-auto disabled:opacity-50`}>Save Vehicle</button>
                </div>
              </form>
            ) : (
              <div className="w-full text-left min-w-[600px]">
                <div className={`grid grid-cols-6 gap-4 p-3.5 border-b-2 ${borderMain} font-bold text-xs uppercase tracking-wide ${baseBg} select-none ${textMuted}`}>
                  <span className={`cursor-pointer ${hoverBg} transition-colors flex items-center gap-1`} onClick={() => requestSort('name')}>Vehicle {sortConfig?.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  <span className={`cursor-pointer ${hoverBg} transition-colors flex items-center gap-1`} onClick={() => requestSort('storage')}>Location {sortConfig?.key === 'storage' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  <span className={`cursor-pointer ${hoverBg} transition-colors flex items-center gap-1`} onClick={() => requestSort('class')}>Class {sortConfig?.key === 'class' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  <span className={`cursor-pointer ${hoverBg} transition-colors flex items-center gap-1`} onClick={() => requestSort('maxSpeed')}>Top Speed {sortConfig?.key === 'maxSpeed' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  <span className={`cursor-pointer ${hoverBg} transition-colors flex items-center gap-1`} onClick={() => requestSort('cost')}>Value {sortConfig?.key === 'cost' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  <span className={`cursor-pointer ${hoverBg} transition-colors flex items-center gap-1`} onClick={() => requestSort('driveTrain')}>Drivetrain {sortConfig?.key === 'driveTrain' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                </div>
                
                <div className={`divide-y-2 ${isDarkMode ? 'divide-neutral-800' : 'divide-neutral-200'} text-sm`}>
                  {sortedVehicles.map((v) => {
                    const isSelected = selectedVehicle?.id === v.id;
                    return (
                      <div key={v.id} onClick={() => { setSelectedVehicle(v); setIsEditing(false); setShowMobileDetail(true); }} className={`grid grid-cols-6 gap-4 p-3.5 cursor-pointer items-center transition-all ${isSelected ? selectedRowBg : hoverBg}`}>
                        <span className="font-bold truncate">{v.name}</span>
                        <span className={`truncate ${isSelected ? 'opacity-80' : textMuted}`}>{v.storage}</span>
                        <span className={`truncate ${isSelected ? 'opacity-80' : textMuted}`}>{v.class}</span>
                        <span className="truncate">{v.maxSpeed}</span>
                        <span className="truncate">{v.cost > 0 ? `$${(v.cost / 1000).toLocaleString()}k` : 'Free'}</span>
                        <span className={`truncate ${isSelected ? 'opacity-80' : textMuted}`}>{v.driveTrain}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: SIDE PANEL (OVERLAY ON MOBILE, GRID ON DESKTOP) */}
        <div className={`
          ${showMobileDetail && selectedVehicle ? 'fixed inset-0 z-50 flex' : 'hidden lg:flex'}
          lg:static flex-col ${cardBg} border-2 ${borderMain} ${shadowMain} overflow-hidden transition-all duration-300
        `}>
          {selectedVehicle ? (
            <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300 lg:animate-none">
              
              {/* Mobile Back Button Overlay */}
              <div className="lg:hidden p-4 border-b-2 border-black flex justify-between items-center bg-black text-white">
                <button onClick={() => setShowMobileDetail(false)} className="flex items-center gap-2 font-bold uppercase text-xs">
                  <ArrowLeft size={16}/> Back to List
                </button>
              </div>

              <div className="relative z-10 p-5 sm:p-6 border-b-2 border-dashed border-neutral-300 dark:border-neutral-700 flex-shrink-0">
                <div className="absolute top-4 right-4 flex gap-2 z-30">
                   <button onClick={() => { setIsEditing(!isEditing); setEditStorage(selectedVehicle.storage === "Unassigned" ? "" : selectedVehicle.storage); }} className={`p-2 ${cardBg} ${hoverBg} border-2 ${borderMain} transition-colors ${textMuted} hover:${textMain}`} title="Edit Details">
                     <Edit2 size={14} />
                   </button>
                   <button onClick={() => deleteVehicleFromInventory(selectedVehicle.id)} className={`p-2 ${cardBg} ${hoverBg} border-2 ${borderMain} transition-colors ${textMuted} hover:${textMain}`} title="Delete Vehicle">
                     <Trash2 size={14} />
                   </button>
                </div>

                <p className={`text-xs font-bold uppercase tracking-wide ${textMuted} mb-1`}>{selectedVehicle.manufacturer?.toString()}</p>
                <h2 className="text-2xl font-black uppercase tracking-tight pr-20 truncate">{selectedVehicle.name?.toString()}</h2>
                
                <div className={`w-full h-48 ${baseBg} mt-5 border-2 ${borderMain} flex items-center justify-center relative overflow-hidden group shadow-inner`}>
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
                      <input type="text" value={editStorage} onChange={(e) => setEditStorage(e.target.value)} placeholder="New Garage Name..." className={`w-full ${baseBg} ${textMain} border-2 ${borderMain} p-2 text-sm outline-none`} />
                    </label>
                    <button onClick={updateVehicleDetails} className={`py-2 flex items-center justify-center gap-2 ${buttonPrimary} text-sm font-bold border-2 ${borderMain} transition-all`}><Save size={14}/> Save Changes</button>
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
          <div className={`${cardBg} border-2 ${borderMain} p-6 sm:p-8 w-full max-w-lg ${shadowMain} relative animate-in zoom-in-95 duration-200`}>
            <button onClick={() => setShowImportModal(false)} className={`absolute top-4 right-4 p-1.5 ${hoverBg} transition-colors ${textMuted} hover:${textMain}`}><X size={18} /></button>
            <h2 className="text-xl font-bold uppercase tracking-wide mb-1">Import Vehicles</h2>
            <p className={`text-sm mb-6 ${textMuted}`}>Upload a JSON file. Ensure the keys match the template.</p>
            
            <div className={`bg-neutral-900 p-4 font-mono text-xs overflow-x-auto relative mb-6 border-2 ${isDarkMode ? 'border-neutral-700' : 'border-black'}`}>
              <button onClick={copyTemplate} className="absolute top-2 right-2 p-1.5 bg-white text-black hover:bg-neutral-300 flex items-center gap-1.5 transition-colors font-sans text-[10px] font-bold uppercase">
                {copiedTemplate ? <><Check size={12}/> Copied</> : <><Copy size={12}/> Copy</>}
              </button>
              <pre className="text-neutral-100">
{`[
  {
    "vehicle_id": "6813-buffalo-stx-pursuit",
    "storage": "Agency Garage"
  }
]`}
              </pre>
            </div>

            <div className="flex justify-end gap-3">
               <input type="file" accept=".json" id="json-upload" className="hidden" ref={fileInputRef} onChange={handleImport} />
               <label htmlFor="json-upload" className={`cursor-pointer px-5 py-2.5 ${buttonPrimary} border-2 ${borderMain} font-bold text-sm uppercase tracking-wide transition-all ${shadowSmall} hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none text-center w-full sm:w-auto`}>
                 Select JSON File
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
    <div className={`flex justify-between items-center p-2.5 ${highlightClass}`}>
      <span className={`font-medium text-xs ${highlight ? 'opacity-80' : (isDark ? 'text-neutral-400' : 'text-neutral-500')}`}>{label}</span>
      <span className={`font-bold text-right truncate max-w-[150px] sm:max-w-[200px]`}>{value || 'N/A'}</span>
    </div>
  );
}