/// <reference types="vite/client" />

declare module '*.png' {
  const content: string;
  export default content;
}

declare module 'shpjs' {
  function shp(data: string | ArrayBuffer | { url: string }): Promise<any>;
  export default shp;
}
