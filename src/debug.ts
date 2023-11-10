const DEBUG = true;
export default (label: string) =>
  DEBUG ? (...data: any) => console.log(label + ":", ...data) : () => {};
