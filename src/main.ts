// create a button that alerts to screen that it was clicked
const button = document.createElement("button");
button.textContent = "Click me!";
button.onclick = () => alert("You clicked me!");
document.body.appendChild(button);
