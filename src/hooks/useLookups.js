import { useState, useEffect, useCallback } from "react";
import { getMaterialTypes, getMaterialGrades, getPartStatuses, getProjects, getProcesses, getVendors } from "../api/lookups";

async function safe(fn) {
  try { return await fn(); } catch { return []; }
}

export function useLookups() {
  const [materialTypes,  setMaterialTypes]  = useState([]);
  const [materialGrades, setMaterialGrades] = useState([]);
  const [partStatuses,   setPartStatuses]   = useState([]);
  const [projects,       setProjects]       = useState([]);
  const [processes,      setProcesses]      = useState([]);
  const [vendors,        setVendors]        = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const [types, grades, statuses, projs, procs, vends] = await Promise.all([
      safe(getMaterialTypes),
      safe(getMaterialGrades),
      safe(getPartStatuses),
      safe(getProjects),
      safe(getProcesses),
      safe(getVendors),
    ]);
    setMaterialTypes(types);
    setMaterialGrades(grades);
    setPartStatuses(statuses);
    setProjects(projs);
    setProcesses(procs);
    setVendors(vends);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    // Re-fetch when user returns to the tab so newly added items appear
    window.addEventListener('focus', fetchAll);
    return () => window.removeEventListener('focus', fetchAll);
  }, [fetchAll]);

  return { materialTypes, materialGrades, partStatuses, projects, processes, vendors, loading, refetch: fetchAll };
}
