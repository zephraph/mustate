# Mustate

> Minimal immutable state management for React

## Quick Start

```bash
npm install @just-be/mustate
```

**Table of Contents**

- [Example](#example)
- [API](#api)
  - [`createStore<State>(initialState: State): Store<State>`](#createstorestateintialstate-state-storestate)
  - [`createStoreHook<State>(store: Store<State>): useStore`](#createstorehookstatestore-storestate-usestore)
  - [`createStoreWithHook<State>(initialState: State): [Store<State>, useStore]`](#createstorewithhookstateintialstate-state-storestate-usestore)
    - [`store`](#store)
    - [`useStore<Value>(selector: (state: State) => Value): Value`](#usestorevalueselector-state-state--value-value)

## Example

```jsx
import React from 'react';
import { render } from 'react-dom';
import { createStoreWithHook } from '@just-be/mustate';

// Create a lil' store with some state
let [store, useStore] = createStoreWithHook({
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

// You can update the store from anywhere you want to,
// even outside of React code. Use set with a function for immutable updates.
function increment() {
  store.set(state => {
    state.count++;
  });
}

// Or you can update it with a new object
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

### `createStore<State>(initialState: State): Store<State>`

Create a mustate `store` given some initial state. Returns a store instance that can be used anywhere in your application.

```jsx
import { createStore } from '@just-be/mustate';

const store = createStore({ count: 0, name: 'Alice' });
```

### `createStoreHook<State>(store: Store<State>): useStore`

Create a React hook for a specific store. This allows you to subscribe to state changes in React components.

```jsx
import { createStore, createStoreHook } from '@just-be/mustate';

const store = createStore({ count: 0 });
const useStore = createStoreHook(store);

// In a React component
function Counter() {
  const count = useStore(state => state.count);
  return <div>{count}</div>;
}
```

### `createStoreWithHook<State>(initialState: State): [Store<State>, useStore]`

Convenience function that combines `createStore` and `createStoreHook`. This is equivalent to calling both functions separately.

```jsx
import { createStoreWithHook } from '@just-be/mustate';

const [store, useStore] = createStoreWithHook({ count: 0, name: 'Alice' });
```

The `store` has the following API you can use in or out of React:

#### `store`

| **Method**                                            | **Description**                                                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `get()`                                               | Get the current state. Do not use this inside of React, you should instead use [`useStore`](#usestorevalueselector-state-state--value-value)                  |
| `set(nextState: S \| (prevState: S) => V): void;`     | Set state. This can either take a new value or an updater function (just like React.useState's updater). Updater functions can use mutative-style updates powered by mutative. |
| `on(listener: Function): () => void;`                 | Subscribe to store. Pass in a callback function that will be executed on updates. `on()` returns the unsubscribe function for your convenience. |
| `off(listener: Function): void;`                      | Unsubscribe a given listener function                                                                                                           |
| `reset(): void`                                       | Set state back to the `initialState` used when creating the store                                                                               |

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

## Inspiration

This project was inspired by Jared Palmer's [Mutik](https://github.com/jaredpalmer/mutik).
