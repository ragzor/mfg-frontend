export let LISTS = {
  processes: ['Raw Material Check','Cutting','Laser Cutting','Machining','Deburring','Drilling','Welding','Buffing','Electroplating','Powder Coating','Nitriding'],
  materialTypes: ['Metal','Alloy Steel','Stainless Steel','Aluminium','Titanium','Plastic','PTFE','Composite','Cast Iron','Inconel'],
  materialGrades: ['SS316','SS304','Al6061','Ti-6Al-4V','Inconel 718','Cast Iron','PTFE','Al7075','EN24','EN8','SS2205'],
  vendors: ['Apex Metals','TitanForm','Foundry Works','SealTech','HydroFlow','ProAlloy','MechParts Co','AlloyCraft'],
  resources: [
    {id:'E01',name:'Arjun Mehta',  role:'Machinist',    color:'#3b82f6'},
    {id:'E02',name:'Priya Sharma', role:'Welder',        color:'#ef4444'},
    {id:'E03',name:'Ravi Patel',   role:'Machinist',    color:'#8b5cf6'},
    {id:'E04',name:'Sunita Rao',   role:'Fabricator',   color:'#22c55e'},
    {id:'E05',name:'Dev Kapoor',   role:'QC Inspector', color:'#f97316'},
    {id:'E06',name:'Anita Joshi',  role:'Welder',        color:'#06b6d4'},
    {id:'E07',name:'Kiran Das',    role:'Coater',        color:'#eab308'},
    {id:'E08',name:'Mohan Singh',  role:'Driller',       color:'#f472b6'},
  ],
  projects: ['Alpha Turbine Build','Beta Compressor Unit','Gamma Frame Fabrication'],
};

export let PARTS = [
  {id:'PT-001',name:'Main Drive Shaft',    project:'Alpha Turbine Build',    qty:2, matType:'Stainless Steel', matGrade:'SS316',       status:'In Progress', currentStep:2, vendor:'Apex Metals',   po:'PO-2024-0112', eta:'2025-03-10', processes:['Raw Material Check','Cutting','Machining','Deburring'], asanaId:'1204578901234560'},
  {id:'PT-002',name:'Compressor Blade Set',project:'Beta Compressor Unit',   qty:12,matType:'Titanium',        matGrade:'Ti-6Al-4V',   status:'Completed',   currentStep:4, vendor:'TitanForm',     po:'PO-2024-0087', eta:'2025-02-28', processes:['Raw Material Check','Laser Cutting','Deburring','Nitriding'], asanaId:'1204578901234561'},
  {id:'PT-003',name:'Frame Weldment A',    project:'Gamma Frame Fabrication',qty:1, matType:'Aluminium',       matGrade:'Al6061',      status:'Not Started', currentStep:0, vendor:'—',             po:'—',            eta:'—',          processes:['Raw Material Check','Cutting','Welding','Buffing','Powder Coating'], asanaId:''},
  {id:'PT-004',name:'Bearing Housing',     project:'Alpha Turbine Build',    qty:4, matType:'Cast Iron',       matGrade:'Cast Iron',   status:'On Hold',     currentStep:1, vendor:'Foundry Works',  po:'PO-2024-0155', eta:'2025-03-20', processes:['Raw Material Check','Machining','Drilling','Deburring'], asanaId:'1204578901234562'},
  {id:'PT-005',name:'Seal Ring Assembly',  project:'Beta Compressor Unit',   qty:6, matType:'Plastic',         matGrade:'PTFE',        status:'In Progress', currentStep:2, vendor:'SealTech',      po:'PO-2024-0201', eta:'2025-03-05', processes:['Raw Material Check','Machining','Buffing','Electroplating'], asanaId:''},
  {id:'PT-006',name:'Coolant Manifold',    project:'Alpha Turbine Build',    qty:2, matType:'Stainless Steel', matGrade:'SS304',       status:'Completed',   currentStep:4, vendor:'HydroFlow',     po:'PO-2024-0098', eta:'2025-02-15', processes:['Raw Material Check','Laser Cutting','Welding','Powder Coating'], asanaId:'1204578901234563'},
  {id:'PT-007',name:'Rotor Disc',          project:'Alpha Turbine Build',    qty:3, matType:'Inconel',         matGrade:'Inconel 718', status:'In Progress', currentStep:1, vendor:'ProAlloy',      po:'PO-2024-0210', eta:'2025-04-01', processes:['Raw Material Check','Machining','Drilling','Nitriding'], asanaId:'1204578901234564'},
];

export const AUDIT_LOGS = [
  {time:'2025-02-28 09:14',action:'UPDATE',resource:'PROCESS',user:'M. Singh',detail:'PT-001 · Machining → In Progress'},
  {time:'2025-02-28 08:52',action:'CREATE',resource:'PART',   user:'A. Patel',detail:'New part: Rotor Disc (PT-007)'},
  {time:'2025-02-28 08:30',action:'LOGIN', resource:'USER',   user:'R. Kumar',detail:'Admin login from 10.0.1.12'},
  {time:'2025-02-27 17:45',action:'UPDATE',resource:'PART',   user:'A. Patel',detail:'PT-004 · Vendor → Foundry Works'},
  {time:'2025-02-27 16:20',action:'UPDATE',resource:'PROCESS',user:'M. Singh',detail:'PT-002 · Nitriding → Completed'},
];

export const STATUS_BADGE = {
  'Completed':   's-comp',
  'In Progress': 's-prog',
  'On Hold':     's-hold',
  'Not Started': 's-ns',
};
