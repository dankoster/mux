import { render } from "solid-js/web";
import { data, connections } from "./data/useData";

const App = () => {

  return <>
    <div>data: {data()}</div>
    <ul>
      {connections().map(c => <li>{c}</li>)}
    </ul>
  </>;
};

render(() => <App />, document.getElementById("root"));
