"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Download, Upload, Plus, LogIn, LogOut, Car, Info, Trash2 } from 'lucide-react';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loadingAuth, setLoadingAuth] = useState(false);

  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchVehicles(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchVehicles(session.user.id);
      else setVehicles([]);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchVehicles = async (userId: string) => {
    const { data, error } = await supabase.from('user_vehicles').select('*').order('created_at', { ascending: false });
    if (!error && data) setVehicles(data);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingAuth(true);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert(error.message);
    else alert('Check your email for the confirmation link!');
    setLoadingAuth(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingAuth(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    setLoadingAuth(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSelectedVehicle(null);
  };

  const deleteVehicle = async (id: string) => {
    await supabase.from('user_vehicles').delete().eq('id', id);
    setVehicles(vehicles.filter(v => v.id !== id));
    if (selectedVehicle?.id === id) setSelectedVehicle(null);
  };

  // --- IMPORT / EXPORT LOGIC ---
  const handleExport = () => {
    const dataStr = JSON.stringify(vehicles, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'gta_vehicles_backup.json';
    link.click();
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !session) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedData = JSON.parse(e.target?.result as string);
        if (Array.isArray(importedData)) {
          // Add user_id to all imported records
          const dataToInsert = importedData.map(v => ({ ...v, user_id: session.user.id }));
          const { data, error } = await supabase.from('user_vehicles').insert(dataToInsert).select();
          if (!error && data) setVehicles([...vehicles, ...data]);
        }
      } catch (error) {
        alert('Invalid JSON file format.');
      }
    };
    reader.readAsText(file);
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">
        <form className="bg-neutral-900 p-8 rounded-lg border border-neutral-800 w-96 flex flex-col gap-4">
          <h1 className="text-2xl font-bold text-center mb-4 tracking-widest">GTA TRACKER</h1>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-neutral-800 p-3 rounded outline-none" required />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="bg-neutral-800 p-3 rounded outline-none" required />
          <div className="flex gap-2 mt-4">
            <button onClick={handleSignIn} disabled={loadingAuth} className="flex-1 bg-blue-600 hover:bg-blue-500 py-2 rounded font-semibold transition">Log In</button>
            <button onClick={handleSignUp} disabled={loadingAuth} className="flex-1 bg-neutral-700 hover:bg-neutral-600 py-2 rounded font-semibold transition">Sign Up</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans">
      {/* HEADER */}
      <header className="flex justify-between items-center p-4 bg-neutral-900 border-b border-neutral-800">
        <h1 className="text-xl font-bold tracking-wider text-white">MY GTA VEHICLES</h1>
        <div className="flex gap-4">
          <label className="cursor-pointer flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded text-sm transition-colors">
            <Upload size={16} /> Import JSON
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded text-sm transition-colors">
            <Download size={16} /> Export JSON
          </button>
          <button onClick={handleSignOut} className="flex items-center gap-2 px-3 py-2 bg-red-600/20 text-red-500 hover:bg-red-600/40 rounded text-sm transition-colors">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-73px)]">
        {/* LEFT: LIST */}
        <div className="lg:col-span-2 flex flex-col bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
            <h2 className="font-semibold text-neutral-400 uppercase text-sm tracking-widest">Inventory ({vehicles.length})</h2>
            <button onClick={() => setShowAddForm(!showAddForm)} className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-white hover:text-black rounded text-sm transition-all duration-200">
              <Plus size={16} /> Add Custom Entry
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {showAddForm ? (
              <AddCustomVehicleForm session={session} onAdd={(v) => { setVehicles([v, ...vehicles]); setShowAddForm(false); }} onCancel={() => setShowAddForm(false)} />
            ) : (
              <div className="w-full text-left text-sm">
                <div className="grid grid-cols-4 gap-4 p-3 text-neutral-500 border-b border-neutral-800 font-semibold mb-2">
                  <span>Name</span><span>Storage</span><span>Class</span><span>Top Speed</span>
                </div>
                {vehicles.length === 0 ? (
                  <div className="text-center p-10 text-neutral-600 flex flex-col items-center">
                    <Car size={48} className="mb-4 opacity-20" />
                    <p>No vehicles in inventory. Add one or import JSON.</p>
                  </div>
                ) : (
                  vehicles.map((v) => (
                    <div key={v.id} onClick={() => setSelectedVehicle(v)} className={`grid grid-cols-4 gap-4 p-3 cursor-pointer border-b border-neutral-800/50 hover:bg-neutral-800 transition-colors ${selectedVehicle?.id === v.id ? 'bg-neutral-800 border-l-2 border-l-blue-500' : ''}`}>
                      <span className="font-medium text-white truncate">{v.manufacturer} {v.name}</span>
                      <span className="truncate">{v.storage}</span>
                      <span className="truncate">{v.class}</span>
                      <span className="truncate">{v.max_speed}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: SIDE PANEL */}
        <div className="bg-neutral-100 text-neutral-900 border border-neutral-300 rounded-lg overflow-hidden flex flex-col h-full relative">
          {selectedVehicle ? (
            <div className="flex-1 overflow-y-auto">
               <button onClick={() => deleteVehicle(selectedVehicle.id)} className="absolute top-4 right-4 p-2 bg-red-100 text-red-600 hover:bg-red-200 rounded-full transition z-10" title="Delete Vehicle">
                  <Trash2 size={18} />
               </button>
              <div className="p-6 border-b border-neutral-300 bg-white">
                <h2 className="text-2xl font-bold pr-10">{selectedVehicle.manufacturer} {selectedVehicle.name}</h2>
                <div className="w-full h-48 bg-neutral-200 mt-4 border border-neutral-300 flex items-center justify-center rounded overflow-hidden">
                   {selectedVehicle.image_url ? ( <img src={selectedVehicle.image_url} alt="Car" className="object-cover w-full h-full" /> ) : ( <Car size={48} className="text-neutral-400" /> )}
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 gap-y-3 text-sm">
                  <DetailRow label="Storage" value={selectedVehicle.storage} />
                  <DetailRow label="Class" value={selectedVehicle.class} />
                  <DetailRow label="Max Speed" value={selectedVehicle.max_speed} />
                  <DetailRow label="HSW Available" value={selectedVehicle.hsw_available ? "Yes" : "No"} />
                  <DetailRow label="Cost" value={`$${Number(selectedVehicle.cost).toLocaleString()}`} />
                  <DetailRow label="Drive Train" value={selectedVehicle.drive_train} />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 p-6 text-center">
              <Info size={32} className="mb-4 text-neutral-400" />
              <p>Select a vehicle to view detailed stats.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function DetailRow({ label, value }: { label: string, value: any }) {
  return (
    <div className="flex justify-between border-b border-neutral-200 pb-2">
      <span className="font-semibold text-neutral-600">{label}:</span>
      <span className="font-bold text-neutral-900 text-right">{value || 'N/A'}</span>
    </div>
  );
}

function AddCustomVehicleForm({ session, onAdd, onCancel }: { session: any, onAdd: (v: any) => void, onCancel: () => void }) {
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const newVehicle = {
      user_id: session.user.id,
      name: formData.get('name') as string,
      manufacturer: formData.get('manufacturer') as string,
      storage: formData.get('storage') as string,
      class: formData.get('class') as string,
      max_speed: formData.get('max_speed') as string,
      cost: Number(formData.get('cost')) || 0,
      hsw_available: formData.get('hsw_available') === 'on',
    };
    
    const { data, error } = await supabase.from('user_vehicles').insert([newVehicle]).select();
    if (error) alert("Error saving vehicle: " + error.message);
    else if (data) onAdd(data[0]);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-neutral-800 p-6 rounded text-neutral-200">
      <h3 className="text-lg font-bold text-white mb-4">Add Custom Vehicle</h3>
      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
        <label className="flex flex-col gap-1">Manufacturer <input name="manufacturer" required className="bg-neutral-900 border border-neutral-700 p-2 rounded" /></label>
        <label className="flex flex-col gap-1">Vehicle Name <input name="name" required className="bg-neutral-900 border border-neutral-700 p-2 rounded" /></label>
        <label className="flex flex-col gap-1">Storage Location <input name="storage" required className="bg-neutral-900 border border-neutral-700 p-2 rounded" /></label>
        <label className="flex flex-col gap-1">Vehicle Class <input name="class" className="bg-neutral-900 border border-neutral-700 p-2 rounded" /></label>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm hover:bg-neutral-700 rounded transition-colors">Cancel</button>
        <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded font-medium transition-colors">Save Entry</button>
      </div>
    </form>
  );
}