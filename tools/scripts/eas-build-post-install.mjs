import { symlink, existsSync } from 'fs';
import { join } from 'path';

const [workspaceRoot, projectRoot] = process.argv.slice(2);

if (existsSync(join(workspaceRoot, 'node_modules'))) {
  console.log('Symlink already exists');
  process.exit(0);
}

symlink(
  join(projectRoot, 'node_modules'),
  join(workspaceRoot, 'node_modules'),
  'dir',
  (err) => {
    if (err) console.log(err);
    else {
      console.log('Symlink created');
    }
  },
);
