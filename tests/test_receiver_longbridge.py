"""Mocked receiver relay tests: no socket, gateway, credential or account is used."""
import importlib.util
import io
import json
from pathlib import Path
from unittest import TestCase, main, mock

PATH = Path(__file__).resolve().parents[1] / '手机记账' / 'sync-server.py'
spec = importlib.util.spec_from_file_location('receiver_public_test', PATH)
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


def handler(path='/api/longbridge/exchange-rates', headers=None, ip='127.0.0.1'):
    value = server.Handler.__new__(server.Handler)
    value.path, value.client_address = path, (ip, 12345)
    value.headers = headers if headers is not None else {'Host': 'localhost:4176', 'X-Finance-Request': '1'}
    value.send_json, value.send_error = mock.Mock(), mock.Mock()
    return value


class ReceiverRelayTests(TestCase):
    def test_rejects_lan_and_cross_origin_without_contacting_gateway(self):
        cases = [
            handler(ip='192.0.2.1'),
            handler(headers={'Host':'localhost:4176'}),
            handler(headers={'Host':'attacker.example:4176','X-Finance-Request':'1'}),
            handler(headers={'Host':'localhost:4176','X-Finance-Request':'1','Origin':'https://attacker.example'}),
            handler(headers={'Host':'localhost:4176','X-Finance-Request':'1','Sec-Fetch-Site':'cross-site'}),
        ]
        with mock.patch.object(server, 'build_opener') as factory:
            for value in cases:
                value.relay_longbridge()
                value.send_error.assert_called_once_with(403)
            factory.assert_not_called()

    def test_unknown_path_is_not_an_open_proxy(self):
        value = handler('/api/longbridge/place-order')
        with mock.patch.object(server, 'build_opener') as factory:
            value.relay_longbridge()
            value.send_error.assert_called_once_with(404)
            factory.assert_not_called()

    def test_reads_fixed_local_gateway_and_preserves_payload(self):
        data = {'ok':True,'source':'Longbridge OpenAPI','data':{'rates':[]}}
        response = mock.MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = json.dumps(data).encode()
        response.code = 200
        opener = mock.Mock()
        opener.open.return_value = response
        value = handler('/api/longbridge/quotes?symbols=EXAMPLE.US')
        with mock.patch.object(server, 'build_opener', return_value=opener):
            value.relay_longbridge()
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, 'http://127.0.0.1:4190/api/longbridge/quotes?symbols=EXAMPLE.US')
        self.assertEqual(request.get_header('X-finance-request'), '1')
        value.send_json.assert_called_once_with(data, status=200)

    def test_redirect_handler_never_creates_a_followup_request(self):
        request = server.UpstreamRequest('http://127.0.0.1:4190/api/longbridge/status')
        with self.assertRaises(server.HTTPError):
            server.RejectGatewayRedirects().redirect_request(
                request, io.BytesIO(), 302, 'redirect', {}, 'https://example.invalid/collect')

    def test_302_upstream_is_unavailable_and_not_relayed(self):
        value = handler()
        opener = mock.Mock()
        opener.open.side_effect = server.HTTPError(
            'http://127.0.0.1:4190/api/longbridge/status', 302, 'redirect', {}, io.BytesIO(b'{}'))
        with mock.patch.object(server, 'build_opener', return_value=opener):
            value.relay_longbridge()
        self.assertEqual(value.send_json.call_args.kwargs['status'], 503)
        self.assertEqual(value.send_json.call_args.args[0]['error']['code'], 'gateway_unavailable')
        opener.open.assert_called_once()

    def test_failure_reports_unavailable_without_starting_service(self):
        value = handler()
        opener = mock.Mock()
        opener.open.side_effect = OSError('local test failure')
        with mock.patch.object(server, 'build_opener', return_value=opener):
            value.relay_longbridge()
        data = value.send_json.call_args.args[0]
        self.assertFalse(data['ok'])
        self.assertEqual(data['error']['code'], 'gateway_unavailable')
        self.assertEqual(value.send_json.call_args.kwargs['status'], 503)


if __name__ == '__main__':
    main()
