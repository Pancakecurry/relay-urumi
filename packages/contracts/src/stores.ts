export interface StoreComponent {
 id:string;kind:string;name:string;state:string;uid?:string;detail:string;
 resources?:{requests:Record<string,string>;limits:Record<string,string>};
 usage?:{cpuMillicores:number;memoryMiB:number;sampledAt:string};
 configuration:Record<string,string|number|boolean|null>;
 diagnostics:string[];
}
export interface StoreObservation {
 storeId:string;observedAt:string;namespace:string;components:StoreComponent[];
 edges:{from:string;to:string;relationship:string}[];
 metrics:{available:boolean;reason:string|null;cpuMillicores:number|null;memoryMiB:number|null;sampledAt:string|null};
 quota:{hard:Record<string,string>;used:Record<string,string>}|null;
 tools:{name:string;alias:string}[];toolState:string;toolCheckedAt:string|null;
 conditions:string[];
}
