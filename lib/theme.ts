/** Vor dem ersten Zeichnen ausführen, damit die gewählte Ansicht (hell/dunkel) nicht flackert. */
export const themeScript = `try{if(localStorage.getItem("theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;
