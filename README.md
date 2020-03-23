bbb-easy-join
-------------

An easy frontend to BigBlueButton without signups - everybody can just entry a meeting room name, the first user gets moderator level access.

<img src="docs/overview.png" width="350" /> <img src="docs/join-room.png" width="350" />

### Setup

Tested with an BBB instance installed with [bbb-install.sh](https://github.com/bigbluebutton/bbb-install).

Checkout this repository to /var/www/bbb-easy-join

```
git clone https://github.com/stadtulm/bbb-easy-join.git /var/www/bbb-easy-join
sudo chown -r bigbluebutton: /var/www/bbb-easy-join
sudo -iu bigbluebutton
cd /var/www/bbb-easy-join
npm install
```

Create an `.env` file (use `.env.sample` as a template) and enter your BBB API URL and Secret there. You can get these by running `sudo bbb-conf --secret`.

For serving the pages, copy `bbb-easy-join.nginx` to `/etc/bigbluebutton/nginx/`. If there are already `greenlight-redirect.nginx` and/or `greenlight.nginx`, rename (remove the .nginx suffix) or delete them.

If you want to keep the service running, the systemd service file `bbb-easy-join.service` can be copied to `/etc/systemd/system/` and activated by `sudo systemctl daemon-reload`, `sudo systemctl enable bbb-easy-join` and `sudo systemctl start bbb-easy-join`.

### Note

Your BigBlueButton Instance is then (if not only reachable from inside your network) public, everybody can create and moderate/present in a meeting. Therefore, you may want to think about disabling recordings, the security of accepting presentation files etc.

### Credits

HTML template, css and images are from the [bigbluebutton default pages](https://github.com/bigbluebutton/bigbluebutton/tree/master/bigbluebutton-config/web).

BigBlueButton and the BigBlueButton Logo are trademarks of [BigBlueButton Inc](http://bigbluebutton.org).

