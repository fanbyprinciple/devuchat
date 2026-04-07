import { render, screen } from '@testing-library/react';
import App from './App';

test('renders DevuChat title', () => {
  render(<App />);
  const titleElement = screen.getByText(/DevuChat/i);
  expect(titleElement).toBeInTheDocument();
});
