export default (DEBUG: boolean) => (label: string) =>
  DEBUG ? (...data: any) => console.log(label + ":", ...data) : () => {};
