import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { AppData } from './types'
import { loadData, saveData } from './utils/storage'
import { DEFAULT_DATA } from './utils/defaultData'
import Dashboard from './views/Dashboard'
import ProjectPlan from './views/ProjectPlan'
import Resources from './views/Resources'
import Timesheets from './views/Timesheets'
import Settings from './views/Settings'
import Tasks from './views/Tasks'
import RAID from './views/RAID'
import Assistant from './views/Assistant'
import Reports from './views/Reports'
import {
  LayoutDashboard, CalendarDays, Users, Upload, Settings2, Loader2,
  Building2, AlertTriangle, CheckSquare, ShieldAlert, Bot, BarChart3,
} from 'lucide-react'

// ─── App Context ──────────────────────────────────────────────────────────────
interface AppContextType {
  data: AppData
  setData: (d: AppData) => void
  updateData: (d: AppData) => void
  save: (d: AppData) => Promise<void>
  reloadData: () => Promise<void>
  saving: boolean
  saveError: string | null
}

const AppContext = createContext<AppContextType | null>(null)

export function useApp(): AppContextType {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

// ─── Nav items ────────────────────────────────────────────────────────────────
const NAV = [
  { to: '/',           label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/plan',       label: 'Project Plan', icon: CalendarDays },
  { to: '/resources',  label: 'Resources',    icon: Users },
  { to: '/tasks',      label: 'Tasks',        icon: CheckSquare },
  { to: '/raid',       label: 'RAID Log',     icon: ShieldAlert },
  { to: '/timesheets', label: 'Timesheets',   icon: Upload },
  { to: '/assistant',  label: 'Assistant',    icon: Bot },
  { to: '/reports',    label: 'Reports',      icon: BarChart3 },
  { to: '/settings',   label: 'Settings',     icon: Settings2 },
]

function Sidebar() {
  const location = useLocation()
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Building2 size={20} className="text-sky-400" />
        <div>
          <div className="sidebar-brand-title">PM Tracker</div>
          <div className="sidebar-brand-sub">IntoWork × Rapid Circle</div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
          >
            <Icon size={16} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="text-xs text-slate-500 font-mono">v1.0.0</div>
      </div>
    </aside>
  )
}

function SaveBanner({ saving, error }: { saving: boolean; error: string | null }) {
  if (!saving && !error) return null
  return (
    <div className={`save-banner ${error ? 'save-banner-error' : ''}`}>
      {saving && <><Loader2 size={13} className="animate-spin" /> Saving…</>}
      {error && <><AlertTriangle size={13} /> {error}</>}
    </div>
  )
}

// ─── Root app ─────────────────────────────────────────────────────────────────
export default function App() {
  const [data, setDataState] = useState<AppData>(DEFAULT_DATA)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    loadData().then(d => { setDataState(d); setLoading(false) })
  }, [])

  const save = useCallback(async (d: AppData) => {
    setSaving(true)
    setSaveError(null)
    try {
      await saveData(d)
    } catch (e: any) {
      setSaveError(e.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [])

  const reloadData = useCallback(async () => {
    const d = await loadData()
    setDataState(d)
  }, [])

  // Update state + persist
  const setData = useCallback((d: AppData) => {
    setDataState(d)
    save(d)
  }, [save])

  // Update state only — use during drag/live preview to avoid flooding the API
  const updateData = useCallback((d: AppData) => {
    setDataState(d)
  }, [])

  if (loading) {
    return (
      <div className="loading-screen">
        <Loader2 size={28} className="animate-spin text-sky-400" />
        <span>Loading program data…</span>
      </div>
    )
  }

  return (
    <AppContext.Provider value={{ data, setData, updateData, save, reloadData, saving, saveError }}>
      <BrowserRouter>
        <div className="app-shell">
          <Sidebar />
          <main className="main-content">
            <SaveBanner saving={saving} error={saveError} />
            <Routes>
              <Route path="/"           element={<Dashboard />} />
              <Route path="/plan"       element={<ProjectPlan />} />
              <Route path="/resources"  element={<Resources />} />
              <Route path="/tasks"      element={<Tasks />} />
              <Route path="/raid"       element={<RAID />} />
              <Route path="/timesheets" element={<Timesheets />} />
              <Route path="/assistant"  element={<Assistant />} />
              <Route path="/reports"    element={<Reports />} />
              <Route path="/settings"   element={<Settings />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AppContext.Provider>
  )
}
