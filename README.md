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
  - [`useStore<State>(store: Store<State>): State`](#usestorestatestore-storestate-state)
  - [`useStore<State, Selected>(store: Store<State>, selector: (state: State) => Selected): Selected`](#usestorestate-selectedstore-storestate-selector-state-state--selected-selected)
    - [`store`](#store)

## Example

```jsx
import React from 'react';
import { render } from 'react-dom';
import { createStore } from '@just-be/mustate';
import { useStore } from '@just-be/mustate/react';

// Create a store with some state
const store = createStore({
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
// even outside of React code. Use set with a function for mutative-style updates.
function increment() {
  store.set(state => {
    state.count++;
  });
}

// Or you can update it with a new object
function decrement() {
  store.set({ count: store.get().count - 1 });
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

// You can subscribe to "slices" of state by passing a selector to
// useStore. The component will only be re-rendered when that portion of state
// changes.
function Label() {
  const count = useStore(store, state => state.count);
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

#### `store`

The `store` has the following API you can use in or out of React:

| **Method**                                            | **Description**                                                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `get()`                                               | Get the current state. Do not use this inside of React, you should instead use [`useStore`](#usestorestatestore-storestate-state)                  |
| `set(nextState: State): void`                         | Set state to a new value. This performs a shallow merge of the new state with the current state. |
| `set(updater: (draft: State) => void): void`          | Set state using a mutative-style updater function powered by [mutative](https://github.com/unadlib/mutative). The draft can be mutated directly. |
| `subscribe(listener: (notification: PatchNotification) => void): () => void` | Subscribe to all state changes. Returns an unsubscribe function. The listener receives patch and inverse patch information. |
| `subscribe(path: string[], listener: (notification: PatchNotification) => void): () => void` | Subscribe to changes at a specific path in the state tree. Only notified when that path or its ancestors/descendants change. |

### `useStore<State>(store: Store<State>): State`

React hook to subscribe to the entire store state. Returns the complete state object.

```jsx
import { useStore } from '@just-be/mustate/react';

function Component() {
  const state = useStore(store);
  return <div>Count: {state.count}, Name: {state.name}</div>;
}
```

### `useStore<State, Selected>(store: Store<State>, selector: (state: State) => Selected): Selected`

React hook to subscribe to a slice of the store state. The component will only re-render when the selected portion of state changes.

```jsx
import { useStore } from '@just-be/mustate/react';

// Select a specific property
function Label() {
  const count = useStore(store, state => state.count);
  return <p>The count is {count}</p>;
}

// Use with props
function User({ id }) {
  const user = useStore(store, state => state.users[id]);
  return <p>The username is {user.name}</p>;
}

// Select computed values
function EvenOddDisplay() {
  const isEven = useStore(store, state => state.count % 2 === 0);
  return <p>Count is {isEven ? 'even' : 'odd'}</p>;
}
```

## Inspiration

This project was inspired by Jared Palmer's [Mutik](https://github.com/jaredpalmer/mutik).
