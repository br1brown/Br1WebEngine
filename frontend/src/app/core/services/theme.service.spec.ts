import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService — metodi statici WCAG', () => {

    describe('calcContrastRatio', () => {
        it('nero su bianco restituisce 21:1', () => {
            const ratio = ThemeService.calcContrastRatio('#000000', '#ffffff');
            expect(ratio).toBeCloseTo(21, 0);
        });

        it('stesso colore restituisce 1:1', () => {
            const ratio = ThemeService.calcContrastRatio('#3a86ff', '#3a86ff');
            expect(ratio).toBeCloseTo(1, 5);
        });
    });

    describe('getReadableTextColor', () => {
        it('su sfondo scuro restituisce bianco', () => {
            expect(ThemeService.getReadableTextColor('#000000')).toBe('#ffffff');
        });

        it('su sfondo chiaro restituisce nero', () => {
            expect(ThemeService.getReadableTextColor('#ffffff')).toBe('#000000');
        });
    });

    describe('colorPrimary — contrasto WCAG AA ≥ 4.5:1 su bianco', () => {
        const cases: string[] = [
            '#3a86ff', // blu vivace
            '#ffff23', // giallo estremo
            '#ff006e', // rosa
            '#131e54', // navy scuro
            '#ffffff', // bianco puro
        ];

        cases.forEach(color => {
            it(`${color} genera un primary con contrasto ≥ 4.5:1 su bianco`, () => {
                TestBed.configureTestingModule({});
                const svc = TestBed.inject(ThemeService);
                svc.colorTema.set(color);
                const ratio = ThemeService.calcContrastRatio(svc.colorPrimary(), '#ffffff');
                expect(ratio).toBeGreaterThanOrEqual(4.5);
            });
        });
    });

});
