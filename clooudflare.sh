curl https://www.cloudflare.com/ips-v4 -o cf_ips_v4.txt
curl https://www.cloudflare.com/ips-v6 -o cf_ips_v6.txt

# Whitelist IPv4 ranges
while read ip; do sudo ufw allow from $ip to any port 443 proto tcp; done < cf_ips_v4.txt

# Whitelist IPv6 ranges
while read ip; do sudo ufw allow from $ip to any port 443 proto tcp; done < cf_ips_v6.txt

# Reload UFW
sudo ufw reload