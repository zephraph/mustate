# Mustate

> Minimal immutable state management for React

## Quick Start

```bash
npm install @just-be/mustate
```

**Table of Contents**

- [Example](#example)
- [API](#api)
  - [`createStore<State>(initialState: State): [Store<State>, useStore<Value>(selector: (state: State) => Value): Value]`](#createstorestateintialstate-state-storestate-usestorevalueselector-state-state--value-value)
    - [`store`](#store)
    - [`useStore<Value>(selector: (state: State) => Value): Value`](#usestorevalueselector-state-state--value-value)

## Example

```jsx
import React from 'react';
import { render } from 'react-dom';
import { createStore } from '@just-be/mustate';

// Create a lil' store with some state
let [store, useStore] = createStore({
  count: 0,
});

// The app doesn't need a provider
function App() {
  return (
    <div>
      <Label />
      <Buttons />
    </div>
  );
}

// You can mutate the store from anywhere you want to,
// even outside of React code. Mutate is based on mutative.
function increment() {
  store.mutate(state => {
    state.count++;
  });
}

// Or you can update it like React.useState's update
function decrement() {
  store.set(prevState => ({
    ...prevState,
    count: prevState.count - 1
  }));
}

// You don't need to pass the store down as a prop either
function Buttons() {
  return (
    <React.Fragment>
      <button onClick={decrement}>-</button>
      <button onClick={increment}>+</button>
    </React.Fragment>
  );
}

// Lastly, you can subscribe to "slices" of state by passing a selector to
// useStore. The component will only be re-rendered when that portion of state
// changes.
function Label() {
  const count = useStore(state => state.count);
  return <p>The count is {count}</p>;
}

render(<App />, window.root);
```

## API

### `createStore<State>(initialState: State): [Store<State>, useStore<Value>(selector: (state: State) => Value): Value]`

Create a mustate `store` given some initial state. The `store` has the following API you can use in or out of React.

#### `store`

| **Method**                                            | **Description**                                                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `get()`                                               | Get the current state. Do not use this inside of React, you should instead use [`useStore`](#usestorevalueselector-state-state--value-value)                  |
| `set(nextState: S \| (prevState: S) => V): void;`     | Set state. This can either take a new value or and updater function (just like React.useState's updater)                                        |
| `on(listener: Function): () => void;`                 | Subscribe to store. Pass in a callback function that will be executed on updates. `on()` returns the unsubscribe function for your convenience. |
| `off(listener: Function): void;`                      | Unsubscribe a given listener function                                                                                                           |
| `reset(): void`                                       | Set state back to the `initialState` used when creating the store                                                                               |
| `mutate(updater: (draft: Draft) => void \| S): void;` | Mutative-style updater function.                                                                                                                   |

#### `useStore<Value>(selector: (state: State) => Value): Value`

React hook to subscribe to mustate state.

```jsx
const selector = state => state.count;

function Label() {
  const count = useStore(selector);
  return <p>The count is {count}</p>;
}
```

You can use props with mustate selector.

```jsx
function User({ id }) {
  const user = useStore(state => state.users[id]);
  return <p>The username is {user.name}</p>;
}
```
