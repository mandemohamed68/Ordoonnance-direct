module.exports = {
  apps: [
    {
      name: 'ordonnance-direct',
      script: 'dist/server.js',
      // 'max' utilise tous les cœurs CPU du serveur pour des performances optimales
      // Vous pouvez aussi spécifier un nombre fixe comme instances: 2
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
