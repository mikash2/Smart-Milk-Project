import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [clients, setClients] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch('http://user-service:5000/clients')
      .then(res => res.json())
      .then(data => setClients(data));
  }, []);

  const fetchStats = (clientId) => {
    fetch(`http://user-service:5000/clients/${clientId}/stats`)
      .then(res => res.json())
      .then(data => setStats(data));
  };

  return (
    <div className="App">
      <h1>Smart Milk Container Dashboard</h1>
      
      <div className="clients-list">
        <h2>Clients</h2>
        <ul>
          {clients.map(client => (
            <li key={client.id} onClick={() => fetchStats(client.id)}>
              {client.name} - {client.device_id}
            </li>
          ))}
        </ul>
      </div>

      {stats && (
        <div className="stats">
          <h2>Statistics</h2>
          <p>Average Weight: {stats.avg_weight}g</p>
          <p>Minimum Weight: {stats.min_weight}g</p>
          <p>Last Updated: {new Date(stats.last_updated).toLocaleString()}</p>
        </div>
      )}
    </div>
  );
}

export default App;