declare module 'coordtransform' {
 export function wgs84togcj02(lon:number,lat:number):[number,number];
 export function gcj02towgs84(lon:number,lat:number):[number,number];
}
