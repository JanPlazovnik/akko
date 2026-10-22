// The window controls stay clickable above dialog backdrops, and using them shouldn't close the dialog
export function ignoreWindowControls(event: CustomEvent<{ originalEvent: Event }>) {
    const target = event.detail.originalEvent.target;
    if (target instanceof Element && target.closest('.window-controls')) event.preventDefault();
}
